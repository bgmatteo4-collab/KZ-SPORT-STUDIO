/**
 * L'adaptateur Sportmonks.
 *
 * Squelette prêt à être branché : il ne manque que le jeton dans `.env`.
 * Sportmonks est retenu parce qu'il est le seul à documenter publiquement
 * `?include=ballCoordinates`, donc le radar.
 *
 * ── Ce que cet adaptateur doit respecter ──────────────────────────────────────
 *
 *  1. Il TRADUIT vers le modèle interne. Aucun champ Sportmonks ne doit fuir
 *     au-delà de ce fichier.
 *  2. Il horodate en temps mural. Si la réponse porte une heure d'événement, on
 *     l'utilise ; sinon on prend l'heure de réception et on l'assume.
 *  3. Il est IDEMPOTENT. On interroge toutes les 10 à 15 secondes et on reçoit
 *     à chaque fois l'état complet ; on ne doit émettre que les nouveautés.
 *     C'est à ça que servent les `seq` stables, dérivés de l'identité de
 *     l'événement côté fournisseur.
 *  4. Il ne compte RIEN lui-même. Le score vient du fournisseur, toujours.
 */

import type { MatchEvent, MatchMeta, ProviderStatus } from '@kz/core';
import type { Clock, EventSink, Provider } from './provider.js';

const BASE = 'https://api.sportmonks.com/v3/football';

export interface SportmonksOptions {
  token: string;
  fixtureId: number;
  pollMs?: number;
  /** Interroger les coordonnées du ballon. Palier supérieur requis. */
  withBall?: boolean;
}

export class SportmonksProvider implements Provider {
  readonly name = 'sportmonks';

  private timer: ReturnType<typeof setInterval> | null = null;
  private lastEventAt: number | null = null;
  private lastError: string | null = null;
  private seq = 0;
  /** Clés déjà émises, pour ne jamais republier le même fait. */
  private emitted = new Set<string>();
  private meta: MatchMeta | null = null;

  constructor(private readonly options: SportmonksOptions) {}

  async start(sink: EventSink, clock: Clock): Promise<void> {
    const poll = async () => {
      try {
        const data = await this.fetchFixture();
        const events = this.translate(data, clock.now());
        if (events.length > 0) {
          this.lastEventAt = clock.now();
          sink(events);
        }
        this.lastError = null;
      } catch (error) {
        // Une erreur réseau ne doit JAMAIS couper l'antenne : on note et on
        // réessaiera au tour suivant. L'overlay continue sur son dernier état.
        this.lastError = error instanceof Error ? error.message : String(error);
      }
    };

    await poll();
    this.timer = setInterval(poll, this.options.pollMs ?? 12_000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      connected: this.lastError === null && this.timer !== null,
      lastEventAt: this.lastEventAt,
      ...(this.lastError ? { detail: this.lastError } : {}),
    };
  }

  private async fetchFixture(): Promise<unknown> {
    const includes = [
      'participants',
      'scores',
      'events',
      'periods',
      'statistics',
      'lineups.player',
    ];
    if (this.options.withBall) includes.push('ballCoordinates');

    const url = new URL(`${BASE}/fixtures/${this.options.fixtureId}`);
    url.searchParams.set('api_token', this.options.token);
    url.searchParams.set('include', includes.join(';'));

    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      throw new Error(`Sportmonks ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * TODO — à écrire contre la vraie forme des réponses, une fois le jeton en
   * main. On ne devine pas un schéma d'API : on l'observe, on enregistre un
   * match réel en fixture, et on écrit la traduction contre cet enregistrement.
   *
   * La marche à suivre est dans docs/SPORTMONKS.md.
   */
  private translate(_payload: unknown, _now: number): MatchEvent[] {
    return [];
  }
}
