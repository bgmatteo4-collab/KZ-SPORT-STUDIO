/**
 * L'adaptateur Sportmonks.
 *
 * Il interroge l'API, passe les réponses à la traduction, et — c'est le point
 * important — sait les ENREGISTRER.
 *
 * ── Pourquoi l'enregistrement d'abord ────────────────────────────────────────
 *
 * Un essai Sportmonks dure quatorze jours. Écrire la traduction en direct
 * pendant un match, c'est se condamner à attendre le match suivant à chaque
 * erreur. L'enregistreur capture les réponses brutes d'une vraie rencontre ;
 * ensuite on travaille contre ce fichier, autant de fois qu'il faut, sans
 * réseau et sans consommer un seul appel.
 *
 * Trois points de la documentation restent incertains — où vit « domicile /
 * extérieur », la forme de `scores`, la clé interne de `statistics[].data`.
 * Une seule réponse réelle les tranche tous.
 */

import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MatchEvent, ProviderStatus } from '@kz/core';
import type { Clock, EventSink, Provider } from '../provider.js';
import { nouvelEtat, traduire, type EtatTraduction } from './translate.js';
import type { Enveloppe, SmFixture } from './types.js';

const BASE = 'https://api.sportmonks.com/v3/football';

/**
 * Ce qu'on demande. Chaque `include` coûte en temps de réponse, donc on ne
 * demande que ce que le plateau affiche réellement.
 */
const INCLUDES = [
  'participants',
  'state',
  'periods',
  'scores',
  'events',
  'statistics',
  'lineups.player',
  'league',
  'round',
  'venue',
];

export interface SportmonksOptions {
  /** Le match à suivre. */
  fixtureId: number;
  /**
   * Le jeton. Absent, les requêtes partent sans : utile quand un mandataire
   * réseau injecte l'en-tête `Authorization` à notre place.
   */
  token?: string;
  /** Intervalle d'interrogation. Dix secondes : voir la note sur les quotas. */
  pollMs?: number;
  /** Demander les coordonnées du ballon (palier supérieur requis). */
  withBall?: boolean;
  /** Écrire chaque réponse brute dans ce fichier, en JSON par ligne. */
  recordTo?: string;
}

export class SportmonksProvider implements Provider {
  readonly name = 'sportmonks';

  private timer: ReturnType<typeof setInterval> | null = null;
  private etat: EtatTraduction = nouvelEtat();
  private dernierAppel: number | null = null;
  private derniereErreur: string | null = null;
  private restant: number | null = null;
  private appels = 0;

  constructor(private readonly options: SportmonksOptions) {}

  async start(sink: EventSink, clock: Clock): Promise<void> {
    const interroger = async (): Promise<void> => {
      try {
        const brut = await this.appeler();
        const fixture = brut.data;
        this.restant = brut.rate_limit?.remaining ?? null;

        if (this.options.recordTo) this.enregistrer(brut);

        if (!fixture) {
          this.derniereErreur = brut.message ?? 'réponse sans données';
          return;
        }

        const evenements: MatchEvent[] = traduire(fixture, clock.now(), this.etat);
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
    // Dix secondes : le quota est de 2 000 à 3 000 appels par heure et par
    // entité, soit un toutes les 1,2 à 1,8 seconde. À dix, on tient un match
    // entier avec une marge confortable, et le décalage anti-spoiler absorbe
    // largement cette granularité.
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
      this.restant !== null ? `${this.restant} restants` : null,
      lacunes.length > 0 ? `lacunes : ${lacunes.join(', ')}` : null,
      this.derniereErreur,
    ].filter(Boolean);

    return {
      name: `sportmonks · match ${this.options.fixtureId}`,
      connected: this.derniereErreur === null && this.timer !== null,
      lastEventAt: this.dernierAppel,
      ...(details.length > 0 ? { detail: details.join(' — ') } : {}),
    };
  }

  /** Ce que la traduction n'a pas su lire. Vide, c'est bon signe. */
  get lacunes(): string[] {
    return [...this.etat.lacunes];
  }

  private async appeler(): Promise<Enveloppe<SmFixture>> {
    const includes = [...INCLUDES];
    if (this.options.withBall) includes.push('ballCoordinates');

    const url = new URL(`${BASE}/fixtures/${this.options.fixtureId}`);
    url.searchParams.set('include', includes.join(';'));
    // Sportmonks accepte le jeton en paramètre OU en en-tête `Authorization`
    // brut, sans préfixe. On met le paramètre quand on l'a, sinon on laisse
    // l'en-tête à qui de droit.
    if (this.options.token) url.searchParams.set('api_token', this.options.token);

    this.appels += 1;
    const reponse = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(9_000),
    });

    if (reponse.status === 429) {
      throw new Error('quota horaire dépassé (429) — espacer les appels');
    }
    if (reponse.status === 403) {
      throw new Error('403 — ce palier ne donne pas accès à cette donnée');
    }
    if (!reponse.ok) {
      throw new Error(`Sportmonks ${reponse.status} ${reponse.statusText}`);
    }
    return (await reponse.json()) as Enveloppe<SmFixture>;
  }

  /** Une réponse par ligne : le fichier reste lisible et se rejoue en ordre. */
  private enregistrer(brut: unknown): void {
    const chemin = resolve(process.cwd(), this.options.recordTo!);
    try {
      mkdirSync(dirname(chemin), { recursive: true });
      appendFileSync(chemin, `${JSON.stringify({ at: Date.now(), brut })}\n`);
    } catch (erreur) {
      console.warn('[kz] enregistrement impossible :', erreur);
    }
  }
}

/**
 * Capture une réponse unique et l'écrit, joliment formatée.
 *
 * C'est l'outil qui tranche les trois incertitudes : une seule réponse réelle
 * montre où vit « domicile / extérieur », la forme de `scores` et la clé de
 * `statistics[].data`.
 */
export async function capturerUneFois(
  fixtureId: number,
  token: string | undefined,
  vers: string,
  withBall = true,
): Promise<{ chemin: string; octets: number }> {
  const includes = [...INCLUDES];
  if (withBall) includes.push('ballCoordinates');
  const url = new URL(`${BASE}/fixtures/${fixtureId}`);
  url.searchParams.set('include', includes.join(';'));
  if (token) url.searchParams.set('api_token', token);

  const reponse = await fetch(url, { headers: { accept: 'application/json' } });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`Sportmonks ${reponse.status} : ${texte.slice(0, 300)}`);
  }

  const chemin = resolve(process.cwd(), vers);
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, JSON.stringify(JSON.parse(texte), null, 2));
  return { chemin, octets: texte.length };
}

export * from './translate.js';
export * from './types.js';
