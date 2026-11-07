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
import {
  minuteAffichee,
  nouvelEtat,
  traduire,
  type EtatTraduction,
  type SourceEspn,
} from './translate.js';
import {
  LIGUES,
  logoDeLigue,
  type EspnCompetitor,
  type EspnEvent,
  type EspnScoreboard,
  type EspnSummary,
} from './types.js';

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
  /**
   * Jusqu'où va le multiplex.
   *
   * `tout` — tout le football du jour, toutes compétitions. C'est le défaut,
   * parce que l'inverse se voit tout de suite : un vendredi de Brasileirão,
   * le panneau restait vide toute la soirée alors que trente rencontres se
   * jouaient ailleurs.
   *
   * `ligue` — le seul championnat qu'on suit. Un appel réseau de moins, utile
   * pour un soir de Coupe d'Europe où seule la compétition en cours compte.
   */
  multiplexPortee?: 'ligue' | 'tout';
  /**
   * Cadence du tableau global. Quarante-cinq secondes par défaut.
   *
   * Les scores d'ailleurs n'ont pas besoin de la précision de dix secondes
   * qu'on accorde au match commenté, et le délai anti-spoiler lisse de toute
   * façon l'écart. Interroger tout le football toutes les dix secondes
   * triplerait le trafic sans rien apporter à l'antenne.
   */
  multiplexMs?: number;
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

/** Les matchs en cours, TOUTES compétitions — un seul appel. */
export async function matchsEnCours(): Promise<MatchListe[]> {
  return (await toutLeJour()).filter((m) => m.etat === 'in');
}

// ───────────────────────── La liste, pour le sélecteur ───────────────────────

/**
 * Ce que la régie a besoin de savoir d'un match pour le choisir.
 *
 * Volontairement plat et léger : c'est ce qui transite vers le navigateur
 * toutes les quinze secondes pendant qu'une émission tourne. Rien de ce qui
 * sert à la TRADUCTION n'a sa place ici.
 */
export interface MatchListe {
  id: string;
  ligue: string;
  ligueNom: string;
  ligueLogo: string | null;
  /** Coup d'envoi prévu, en ISO 8601. */
  date: string | null;
  /** « pre » à venir, « in » en cours, « post » terminé. */
  etat: 'pre' | 'in' | 'post';
  /** Ce qu'ESPN affiche : « FT », « HT », ou l'heure de coup d'envoi. */
  detail: string;
  /** La minute d'antenne quand le match tourne : « 67 », « 45+2 », « MT ». */
  minute: string;
  domicile: EquipeListe;
  exterieur: EquipeListe;
}

export interface EquipeListe {
  nom: string;
  abbr: string;
  score: number | null;
  logo: string | null;
  couleur: string | null;
}

function equipeListe(c: EspnCompetitor | undefined): EquipeListe {
  const t = c?.team;
  const nom = t?.shortDisplayName ?? t?.displayName ?? t?.name ?? '—';
  const brut = c?.score;
  const n = brut === undefined ? null : Number(brut);
  return {
    nom,
    abbr: t?.abbreviation ?? nom.slice(0, 3).toUpperCase(),
    score: n !== null && Number.isFinite(n) ? n : null,
    logo: t?.logo ?? t?.logos?.find((l) => l.href)?.href ?? null,
    couleur: t?.color ? `#${t.color.replace(/^#/, '')}` : null,
  };
}

/** Un match, mis à plat. La compétition est fournie : le tableau global ne la porte pas. */
function unMatch(
  e: EspnEvent,
  comp_: { ligue: string; nom: string; logo: string | null },
): MatchListe {
  const comp = e.competitions?.[0];
  const st = e.status ?? comp?.status;
  const brut = st?.type?.state;
  const etat: 'pre' | 'in' | 'post' = brut === 'in' ? 'in' : brut === 'post' ? 'post' : 'pre';
  return {
    id: e.id ?? '',
    ligue: comp_.ligue,
    ligueNom: comp_.nom,
    ligueLogo: comp_.logo,
    date: e.date ?? null,
    etat,
    detail: st?.type?.detail ?? st?.type?.shortDetail ?? '',
    minute: minuteAffichee(st),
    domicile: equipeListe((comp?.competitors ?? []).find((c) => c.homeAway === 'home')),
    exterieur: equipeListe((comp?.competitors ?? []).find((c) => c.homeAway === 'away')),
  };
}

/** Met un tableau de bord à plat, prêt pour le sélecteur de la régie. */
export function listerMatchs(bord: EspnScoreboard, ligue: string): MatchListe[] {
  const infos = bord.leagues?.[0];
  const comp = {
    ligue,
    nom: LIGUES[ligue]?.nom ?? infos?.name ?? ligue,
    logo: logoDeLigue(infos) ?? null,
  };
  return (bord.events ?? []).map((e) => unMatch(e, comp));
}

/** La soirée d'un championnat, déjà mise à plat. */
export async function matchsDuJour(ligue: string): Promise<MatchListe[]> {
  return listerMatchs(await tableauDeBord(ligue), ligue);
}

// ──────────────────── Tout le football du jour, en deux appels ───────────────
//
// Le sélecteur ne doit PAS dépendre d'une liste de compétitions écrite en dur :
// c'est ainsi qu'on « ne trouve pas tous les matchs en direct ». Un soir de
// semaine, le football se joue dans quarante championnats, pas dans les neuf
// qu'on avait prévus.
//
// ESPN expose deux choses complémentaires :
//
//   • un CATALOGUE des compétitions (42 ce soir), avec leur identifiant ;
//   • un tableau de bord GLOBAL, toutes compétitions confondues, qui donne
//     jusqu'à cent rencontres en un seul appel.
//
// Le global ne nomme pas la compétition de chaque match — il faut la retrouver.
// Deux chemins, dans cet ordre : l'identifiant caché dans `uid` recoupé avec le
// catalogue, puis, pour les rares manquants, le lien « Table » que chaque match
// porte et qui contient le code de sa compétition.

const CATALOGUE_URL = 'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=soccer';
const CATALOGUE_MS = 3_600_000;

export interface LigueConnue {
  slug: string;
  nom: string;
  /** L'emblème, quand on a pu le résoudre. Voir `emblemesDeLigues`. */
  logo?: string;
}

interface EnTete {
  sports?: { leagues?: { id?: string; slug?: string; name?: string }[] }[];
}

let catalogue: { at: number; parId: Map<string, LigueConnue> } | null = null;

/** Les compétitions qu'ESPN suit aujourd'hui, par identifiant interne. */
export async function catalogueLigues(): Promise<Map<string, LigueConnue>> {
  if (catalogue && Date.now() - catalogue.at < CATALOGUE_MS) return catalogue.parId;
  const parId = new Map<string, LigueConnue>();
  try {
    const d = await json<EnTete>(CATALOGUE_URL);
    for (const l of d.sports?.[0]?.leagues ?? []) {
      if (l.id && l.slug) parId.set(String(l.id), { slug: l.slug, nom: l.name ?? l.slug });
    }
  } catch {
    // Catalogue indisponible : on se rabattra sur le lien « Table » de chaque
    // match. Mieux vaut un menu complet sans jolis noms qu'un menu vide.
  }
  catalogue = { at: Date.now(), parId };
  return parId;
}

/**
 * Les emblèmes de compétition, par code.
 *
 * ── Pourquoi c'est si laborieux ─────────────────────────────────────────────
 *
 * ESPN ne publie l'emblème d'une compétition QUE dans le tableau de bord de
 * cette compétition : le tableau global ne le porte pas, le catalogue non
 * plus, et le CDN n'a pas d'adresse devinable — vérifié sur quatre formes
 * différentes, toutes en 404. Il faut donc un appel par championnat.
 *
 * On le fait à la demande et une fois par heure, en se limitant aux
 * championnats les plus susceptibles d'être affichés : un multiplex ouvert à
 * tout le football croise quarante compétitions, et quarante appels au
 * lancement d'une soirée seraient payés pour des logos qu'on ne montrera pas.
 */
const CACHE_LOGOS = new Map<string, string | null>();
let logosAt = 0;
/** Combien de championnats on accepte de résoudre par rafraîchissement. */
const LOGOS_PAR_TOUR = 6;

async function emblemesDeLigues(slugs: string[]): Promise<Map<string, string>> {
  if (Date.now() - logosAt > CATALOGUE_MS) {
    CACHE_LOGOS.clear();
    logosAt = Date.now();
  }
  let budget = LOGOS_PAR_TOUR;
  for (const slug of slugs) {
    if (CACHE_LOGOS.has(slug) || budget <= 0) continue;
    budget -= 1;
    try {
      const bord = await json<EspnScoreboard>(`${BASE}/${slug}/scoreboard`);
      CACHE_LOGOS.set(slug, logoDeLigue(bord.leagues?.[0]) ?? null);
    } catch {
      // Un championnat sans emblème n'est pas une panne : le multiplex
      // retombe sur son nom court, qui se lit très bien.
      CACHE_LOGOS.set(slug, null);
    }
  }
  const out = new Map<string, string>();
  for (const [slug, url] of CACHE_LOGOS) if (url) out.set(slug, url);
  return out;
}

/** Le code de compétition d'un match du tableau global. */
function ligueDuMatch(e: EspnEvent, parId: Map<string, LigueConnue>): LigueConnue | null {
  const id = /~l:(\d+)~/.exec(e.uid ?? '')?.[1];
  const connue = id ? parId.get(id) : undefined;
  if (connue) return connue;
  // Le lien « Table » porte le code : .../soccer/table/_/league/eng.1
  for (const lien of e.links ?? []) {
    const slug = /\/league\/([a-z0-9._-]+)/i.exec(lien.href ?? '')?.[1];
    if (slug) return { slug, nom: LIGUES[slug]?.nom ?? slug };
  }
  return null;
}

/**
 * Tout le football du jour, toutes compétitions.
 *
 * Les matchs EN COURS remontent en tête — c'est ce qu'on cherche neuf fois sur
 * dix en ouvrant ce menu. Un match dont on ne sait pas rattacher la compétition
 * est quand même listé : on peut toujours le regarder, et l'exclure
 * reviendrait à refaire le défaut qu'on corrige.
 */
export async function toutLeJour(): Promise<MatchListe[]> {
  const [parId, bord] = await Promise.all([
    catalogueLigues(),
    json<EspnScoreboard>(`${BASE}/all/scoreboard`),
  ]);

  const out: MatchListe[] = [];
  for (const e of bord.events ?? []) {
    const ligue = ligueDuMatch(e, parId);
    out.push(
      unMatch(e, {
        ligue: ligue?.slug ?? '',
        nom: ligue ? (LIGUES[ligue.slug]?.nom ?? ligue.nom) : 'Autre compétition',
        logo: null,
      }),
    );
  }

  const rang = { in: 0, pre: 1, post: 2 } as const;
  return out.sort(
    (a, b) =>
      rang[a.etat] - rang[b.etat] ||
      (a.date ?? '').localeCompare(b.date ?? '') ||
      a.ligueNom.localeCompare(b.ligueNom),
  );
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
  private dernierMultiplex = 0;
  private multiplexEnCache: { events: EspnEvent[]; ligues: Record<string, LigueConnue> } | null =
    null;

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

        const multiplex = await this.autresRencontres(tous, maintenant);

        const src: SourceEspn = {
          event,
          ligue: this.options.ligue,
          ...(bord.leagues?.[0] ? { ligueInfos: bord.leagues[0] } : {}),
          ...(this.resumeEnCache ? { summary: this.resumeEnCache } : {}),
          ...multiplex,
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

  /**
   * Les autres rencontres à verser au multiplex.
   *
   * ── Pourquoi une seconde cadence ────────────────────────────────────────
   *
   * Le tableau de bord d'un championnat ne contient QUE ce championnat : un
   * vendredi de Brasileirão, le multiplex restait vide alors que trente
   * matchs se jouaient ailleurs. Le tableau global, lui, couvre tout — mais
   * il est plus lourd, et un score d'ailleurs n'a pas besoin de la précision
   * de dix secondes qu'on accorde au match commenté. D'où un cache à part,
   * rafraîchi toutes les quarante-cinq secondes.
   *
   * En cas d'échec, on rend le dernier tableau connu plutôt que rien : un
   * multiplex figé de trente secondes vaut mieux qu'un panneau qui se vide.
   */
  private async autresRencontres(
    duChampionnat: EspnEvent[],
    maintenant: number,
  ): Promise<Pick<SourceEspn, 'autres' | 'autresLigues'>> {
    if (!this.options.avecMultiplex) return {};

    const local = (): Pick<SourceEspn, 'autres'> => ({
      autres: duChampionnat.filter((e) => e.id !== this.eventId),
    });
    if (this.options.multiplexPortee === 'ligue') return local();

    if (
      this.multiplexEnCache === null ||
      maintenant - this.dernierMultiplex >= (this.options.multiplexMs ?? 45_000)
    ) {
      try {
        const [parId, global] = await Promise.all([
          catalogueLigues(),
          json<EspnScoreboard>(`${BASE}/all/scoreboard`),
        ]);
        const events = global.events ?? [];
        const ligues: Record<string, LigueConnue> = {};
        for (const e of events) {
          const l = ligueDuMatch(e, parId);
          if (e.id && l) ligues[e.id] = { slug: l.slug, nom: LIGUES[l.slug]?.nom ?? l.nom };
        }
        // Les emblèmes, par ordre d'intérêt : on résout d'abord les
        // championnats qu'on a nommés, qui sont ceux qu'on affiche.
        const vus = [...new Set(Object.values(ligues).map((l) => l.slug))].sort(
          (a, b) => (LIGUES[a] ? 0 : 1) - (LIGUES[b] ? 0 : 1),
        );
        const emblemes = await emblemesDeLigues(vus);
        for (const l of Object.values(ligues)) {
          const u = emblemes.get(l.slug);
          if (u) l.logo = u;
        }
        this.multiplexEnCache = { events, ligues };
        this.dernierMultiplex = maintenant;
      } catch {
        // Le tableau global est un CONFORT : son absence ne doit pas priver
        // l'antenne du multiplex de son propre championnat.
        if (this.multiplexEnCache === null) return local();
      }
    }

    const cache = this.multiplexEnCache;
    if (!cache) return local();
    return {
      autres: cache.events.filter((e) => e.id !== this.eventId),
      autresLigues: Object.fromEntries(
        Object.entries(cache.ligues).map(([id, l]) => [
          id,
          { id: l.slug, nom: l.nom, ...(l.logo ? { logo: l.logo } : {}) },
        ]),
      ),
    };
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
    ...(bord.leagues?.[0] ? { ligueInfos: bord.leagues[0] } : {}),
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
