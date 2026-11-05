/**
 * Le rejoueur. Prend un match enregistré et le fait vivre comme s'il se jouait.
 *
 * Deux usages :
 *   • développer et répéter sans attendre un vrai match ;
 *   • transformer un bug vu en direct en fixture, donc en test qui ne régresse plus.
 *
 * L'accéléré est géré par l'horloge du serveur, pas ici : à x20, l'horloge du
 * match avance vingt fois plus vite et le rejoueur se contente de comparer.
 * C'est ce qui permet de voir un match complet en quatre minutes et demie sans
 * qu'aucun chrono ne mente.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MatchEvent, MatchMeta, ProviderStatus } from '@kz/core';
import type { Clock, EventSink, Provider } from './provider.js';

export interface Fixture {
  meta: MatchMeta;
  durationMs: number;
  /** `t` relatifs au coup d'envoi. */
  events: MatchEvent[];
}

export function loadFixture(path: string): Fixture {
  const raw = readFileSync(resolve(process.cwd(), path), 'utf8');
  const parsed = JSON.parse(raw) as Fixture;
  parsed.events.sort((a, b) => a.t - b.t || a.seq - b.seq);
  return parsed;
}

export interface SimulatorOptions {
  fixturePath: string;
  /** Décalage du coup d'envoi : négatif pour démarrer le match déjà commencé. */
  startAtMs?: number;
  /** Cadence d'émission, en ms de temps réel. */
  tickMs?: number;
  loop?: boolean;
}

export class SimulatorProvider implements Provider {
  readonly name = 'simulateur';

  private fixture: Fixture;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private kickoffAt = 0;
  private lastEventAt: number | null = null;
  private clock: Clock | null = null;
  private running = false;

  constructor(private readonly options: SimulatorOptions) {
    this.fixture = loadFixture(options.fixturePath);
  }

  async start(sink: EventSink, clock: Clock): Promise<void> {
    this.clock = clock;
    this.running = true;

    // Le coup d'envoi est placé dans le passé du temps du match, de sorte que
    // `now - kickoffAt` donne directement la minute de jeu.
    this.kickoffAt = clock.now() - (this.options.startAtMs ?? 0);
    this.cursor = 0;

    const tick = () => {
      if (!this.running || !this.clock) return;
      const horizon = this.clock.now() - this.kickoffAt;
      const batch: MatchEvent[] = [];

      while (this.cursor < this.fixture.events.length) {
        const event = this.fixture.events[this.cursor]!;
        if (event.t > horizon) break;
        // On ramène le `t` relatif en temps absolu : c'est la seule traduction.
        batch.push({ ...event, t: this.kickoffAt + event.t } as MatchEvent);
        this.cursor += 1;
      }

      if (batch.length > 0) {
        this.lastEventAt = this.clock.now();
        sink(batch);
      }

      if (this.cursor >= this.fixture.events.length && this.options.loop) {
        this.kickoffAt = this.clock.now();
        this.cursor = 0;
      }
    };

    tick();
    this.timer = setInterval(tick, this.options.tickMs ?? 200);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): ProviderStatus {
    const total = this.fixture.events.length;
    const done = this.cursor >= total;
    return {
      name: `${this.name} — ${this.fixture.meta.home.abbr} / ${this.fixture.meta.away.abbr}`,
      connected: this.running && !done,
      lastEventAt: this.lastEventAt,
      detail: `${this.cursor}/${total} événements rejoués${done ? ' — match terminé' : ''}`,
    };
  }

  /** Repositionne le rejeu à une minute de match donnée. Utile en répétition. */
  seek(matchMs: number, clock: Clock): void {
    this.kickoffAt = clock.now() - matchMs;
    this.cursor = 0;
    while (
      this.cursor < this.fixture.events.length &&
      this.fixture.events[this.cursor]!.t <= matchMs
    ) {
      this.cursor += 1;
    }
  }

  get meta(): MatchMeta {
    return this.fixture.meta;
  }
}
