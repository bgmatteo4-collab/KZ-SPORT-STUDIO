/**
 * L'adaptateur ESPN.
 *
 * ── Pourquoi ce fournisseur existe ──────────────────────────────────────────
 *
 * Sportmonks est la voie propre : données licenciées, contrat, support. Mais
 * son palier gratuit n'ouvre que quatre championnats — la Superliga danoise et
 * la Premiership écossaise — là où KZ TV commente la Ligue des Champions et la
 * Ligue 1. ESPN publie ces compétitions sans jeton, avec les statistiques, les
 * compositions, le classement et les noms de buteurs.
 *
 * C'est donc le fournisseur avec lequel on peut TESTER et DIFFUSER aujourd'hui.
 * Les deux coexistent derrière la même interface ; rien dans le rendu ne sait
 * lequel parle.
 *
 * ── Ce qu'il faut savoir avant de s'y fier en direct ────────────────────────
 *
 * L'API n'est pas documentée et n'est couverte par aucun engagement. Elle peut
 * changer de forme ou fermer sans préavis. La traduction est donc défensive
 * partout (tous les champs optionnels, aucune exception qui remonte), et
 * l'enregistreur garde les réponses brutes : le jour où la forme change, on
 * rejoue la capture et on corrige hors antenne.
 *
 * ── Les deux cadences ───────────────────────────────────────────────────────
 *
 * Le tableau de bord pèse ~15 Ko et porte le score, l'horloge et la période :
 * on l'interroge toutes les 10 secondes. Le résumé pèse ~475 Ko et porte les
 * statistiques et les compositions, qui bougent lentement : toutes les 30
 * secondes suffisent, et ça divise le trafic par trois.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MatchEvent, ProviderStatus } from '@kz/core';
import type { Clock, EventSink, Provider } from '../provider.js';
import { nouvelEtat, traduire, type EtatTraduction, type SourceEspn } from './translate.js';
import { LIGUES, type EspnEvent, type EspnScoreboard, type EspnSummary } from './types.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

export interface EspnOptions {
  /** Identifiant de championnat ESPN : « uefa.champions », « fra.1 »… */
  ligue: string;
  /** Le match à suivre. Absent, on prend le premier match en cours du championnat. */
  eventId?: string;
  /** Cadence du tableau de bord. Dix secondes par défaut. */
  pollMs?: number;
  /** Cadence du résumé. Trente secondes par défaut : il est vingt fois plus lourd. */
  summaryMs?: number;
  /** Inclure les autres rencontres de la soirée, pour le multiplex. */
  avecMultiplex?: boolean;
  /** Écrire chaque réponse dans ce fichier, une par ligne. */
  recordTo?: string;
}

/**
 * Ne garder du résumé que ce qui nous sert.
 *
 * Le résumé complet embarque les articles, les vidéos, les classements de
 * buteurs et les diffuseurs : 475 Ko, dont nous lisons moins d'un dixième.
 * Enregistré tel quel toutes les 30 secondes, un match ferait 85 Mo. On garde
 * les blocs que la traduction lit, PLUS le fil du match — il n'est pas encore
 * exploité, mais c'est la seule source possible d'une carte de pression, et
 * une capture qu'on n'a pas faite ne se refait pas.
 */
export function elaguer(s: EspnSummary | undefined): EspnSummary | undefined {
  if (!s) return undefined;
  return {
    ...(s.boxscore ? { boxscore: s.boxscore } : {}),
    ...(s.rosters ? { rosters: s.rosters } : {}),
    ...(s.keyEvents ? { keyEvents: s.keyEvents } : {}),
    ...(s.standings ? { standings: s.standings } : {}),
    ...(s.odds ? { odds: s.odds } : {}),
    ...(s.commentary ? { commentary: s.commentary } : {}),
    ...(s.gameInfo ? { gameInfo: s.gameInfo } : {}),
  };
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(9_000),
  });
  if (!r.ok) throw new Error(`ESPN ${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

export async function tableauDeBord(ligue: string): Promise<EspnScoreboard> {
  return json<EspnScoreboard>(`${BASE}/${ligue}/scoreboard`);
}

export async function resume(ligue: string, eventId: string): Promise<EspnSummary> {
  return json<EspnSummary>(`${BASE}/${ligue}/summary?event=${encodeURIComponent(eventId)}`);
}

/** Les matchs en cours, tous championnats connus confondus. */
export async function matchsEnCours(): Promise<
  { ligue: string; nom: string; event: EspnEvent }[]
> {
  const resultats = await Promise.allSettled(
    Object.keys(LIGUES).map(async (ligue) => ({ ligue, bord: await tableauDeBord(ligue) })),
  );
  const out: { ligue: string; nom: string; event: EspnEvent }[] = [];
  for (const r of resultats) {
    if (r.status !== 'fulfilled') continue;
    for (const e of r.value.bord.events ?? []) {
      const etat = (e.status ?? e.competitions?.[0]?.status)?.type?.state;
      if (etat === 'in') {
        out.push({ ligue: r.value.ligue, nom: LIGUES[r.value.ligue]?.nom ?? r.value.ligue, event: e });
      }
    }
  }
  return out;
}

export class EspnProvider implements Provider {
  readonly name = 'espn';

  private timer: ReturnType<typeof setInterval> | null = null;
  private etat: EtatTraduction = nouvelEtat();
  private eventId: string | null;
  private dernierResume = 0;
  private resumeEnCache: EspnSummary | undefined;
  private dernierAppel: number | null = null;
  private derniereErreur: string | null = null;
  private appels = 0;

  constructor(private readonly options: EspnOptions) {
    this.eventId = options.eventId ?? null;
  }

  async start(sink: EventSink, clock: Clock): Promise<void> {
    const interroger = async (): Promise<void> => {
      try {
        const bord = await this.appelerBord();
        const tous = bord.events ?? [];

        // Sans match désigné, on prend le premier en cours : c'est ce qu'on
        // veut neuf fois sur dix quand on lance pendant une soirée.
        if (!this.eventId) {
          const enCours = tous.find(
            (e) => (e.status ?? e.competitions?.[0]?.status)?.type?.state === 'in',
          );
          this.eventId = enCours?.id ?? tous[0]?.id ?? null;
        }

        const event = tous.find((e) => e.id === this.eventId);
        if (!event) {
          this.derniereErreur = `match ${this.eventId ?? '?'} absent du tableau de bord`;
          return;
        }

        // Le résumé, plus rarement : il pèse vingt fois plus lourd.
        const maintenant = Date.now();
        if (maintenant - this.dernierResume >= (this.options.summaryMs ?? 30_000)) {
          try {
            this.resumeEnCache = elaguer(await this.appelerResume());
            this.dernierResume = maintenant;
          } catch (erreur) {
            // Un résumé manquant n'est pas grave : le tableau de bord porte
            // déjà le score et l'horloge. On continue avec le précédent.
            this.etat.lacunes.add(
              `résumé indisponible (${erreur instanceof Error ? erreur.message : String(erreur)})`,
            );
          }
        }

        const src: SourceEspn = {
          event,
          ligue: this.options.ligue,
          ...(this.resumeEnCache ? { summary: this.resumeEnCache } : {}),
          ...(this.options.avecMultiplex
            ? { autres: tous.filter((e) => e.id !== this.eventId) }
            : {}),
        };

        if (this.options.recordTo) this.enregistrer(src);

        const evenements: MatchEvent[] = traduire(src, clock.now(), this.etat);
        this.derniereErreur = null;
        this.dernierAppel = clock.now();
        if (evenements.length > 0) sink(evenements);
      } catch (erreur) {
        // Une erreur réseau ne coupe JAMAIS l'antenne : on note, on réessaie au
        // tour suivant, et l'overlay continue sur son dernier état.
        this.derniereErreur = erreur instanceof Error ? erreur.message : String(erreur);
      }
    };

    await interroger();
    this.timer = setInterval(() => void interroger(), this.options.pollMs ?? 10_000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): ProviderStatus {
    const lacunes = [...this.etat.lacunes];
    const details = [
      `${this.appels} appels`,
      this.eventId ? `match ${this.eventId}` : 'aucun match choisi',
      lacunes.length > 0 ? `lacunes : ${lacunes.join(', ')}` : null,
      this.derniereErreur,
    ].filter(Boolean);

    return {
      name: `espn · ${LIGUES[this.options.ligue]?.nom ?? this.options.ligue}`,
      connected: this.derniereErreur === null && this.timer !== null,
      lastEventAt: this.dernierAppel,
      ...(details.length > 0 ? { detail: details.join(' — ') } : {}),
    };
  }

  /** Ce que la traduction n'a pas su lire. Vide, c'est bon signe. */
  get lacunes(): string[] {
    return [...this.etat.lacunes];
  }

  private async appelerBord(): Promise<EspnScoreboard> {
    this.appels += 1;
    return tableauDeBord(this.options.ligue);
  }

  private async appelerResume(): Promise<EspnSummary> {
    if (!this.eventId) throw new Error('aucun match choisi');
    this.appels += 1;
    return resume(this.options.ligue, this.eventId);
  }

  /** Une réponse par ligne : le fichier reste lisible et se rejoue en ordre. */
  private enregistrer(src: SourceEspn): void {
    const chemin = resolve(process.cwd(), this.options.recordTo!);
    try {
      mkdirSync(dirname(chemin), { recursive: true });
      appendFileSync(chemin, `${JSON.stringify({ at: Date.now(), src })}\n`);
    } catch (erreur) {
      console.warn('[kz] enregistrement impossible :', erreur);
    }
  }
}

/**
 * Capture une réponse unique et l'écrit, joliment formatée.
 *
 * C'est l'outil qui tranche les incertitudes : une seule réponse réelle montre
 * la forme exacte des faits, des statistiques et des compositions.
 */
export async function capturerUneFois(
  ligue: string,
  eventId: string,
  vers: string,
): Promise<{ chemin: string; octets: number; src: SourceEspn }> {
  const bord = await tableauDeBord(ligue);
  const tous = bord.events ?? [];
  const event = tous.find((e) => e.id === eventId);
  const summary = await resume(ligue, eventId);

  const src: SourceEspn = {
    ligue,
    ...(event ? { event } : {}),
    summary,
    autres: tous.filter((e) => e.id !== eventId),
  };

  const chemin = resolve(process.cwd(), vers);
  const texte = JSON.stringify(src, null, 2);
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, texte);
  return { chemin, octets: texte.length, src };
}

export * from './translate.js';
export * from './types.js';
