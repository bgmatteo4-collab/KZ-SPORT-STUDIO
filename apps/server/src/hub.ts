/**
 * Le hub : la timeline autoritaire et la diffusion vers les pages.
 *
 * Règle n°1 du projet : le serveur fait autorité. Les pages envoient des
 * intentions (« passe à la scène radar », « mets 32 secondes de délai »), jamais
 * un état. C'est ce qui garantit que l'overlay et la régie ne peuvent pas
 * diverger.
 */

import {
  DEFAULT_CONTROL,
  findScene,
  findTheme,
  type Command,
  type ControlState,
  type MatchEvent,
  type ProviderStatus,
  type ServerMessage,
} from '@kz/core';
import type { ServerClock } from './clock.js';

export type Broadcast = (message: ServerMessage) => void;

export class Hub {
  private events: MatchEvent[] = [];
  private seen = new Set<number>();
  private control: ControlState;
  private provider: ProviderStatus = {
    name: 'aucun',
    connected: false,
    lastEventAt: null,
  };

  constructor(
    private readonly clock: ServerClock,
    private readonly broadcast: Broadcast,
    initialControl: Partial<ControlState> = {},
  ) {
    this.control = { ...DEFAULT_CONTROL, ...initialControl, timeScale: clock.scale };
  }

  /** Point d'entrée des fournisseurs. Idempotent par `seq`. */
  ingest(incoming: readonly MatchEvent[]): void {
    const fresh: MatchEvent[] = [];
    for (const event of incoming) {
      if (this.seen.has(event.seq)) continue;
      this.seen.add(event.seq);
      this.events.push(event);
      fresh.push(event);
    }
    if (fresh.length === 0) return;

    this.events.sort((a, b) => a.t - b.t || a.seq - b.seq);
    this.broadcast({ type: 'events', events: fresh });
  }

  setProviderStatus(status: ProviderStatus): void {
    const changed =
      status.connected !== this.provider.connected ||
      status.detail !== this.provider.detail ||
      status.name !== this.provider.name;
    this.provider = status;
    if (changed) this.broadcast({ type: 'provider', provider: status });
  }

  /** Le message d'accueil : toute la timeline, pour que la page se reconstruise seule. */
  hello(): ServerMessage {
    return {
      type: 'hello',
      serverTime: this.clock.now(),
      events: this.events,
      control: this.control,
      provider: this.provider,
    };
  }

  eventsSince(seq: number): MatchEvent[] {
    return this.events.filter((e) => e.seq > seq);
  }

  get controlState(): ControlState {
    return this.control;
  }

  get timelineSize(): number {
    return this.events.length;
  }

  get providerStatus(): ProviderStatus {
    return this.provider;
  }

  /**
   * Applique une commande. Renvoie `true` si quelque chose a changé.
   * Toute valeur est bornée ici : une régie ne doit pas pouvoir mettre
   * l'antenne dans un état impossible.
   */
  apply(command: Command): boolean {
    const before = this.control;

    switch (command.name) {
      case 'set-delay': {
        this.control = { ...this.control, delayMs: clampDelay(command.delayMs) };
        break;
      }
      case 'nudge-delay': {
        this.control = {
          ...this.control,
          delayMs: clampDelay(this.control.delayMs + command.deltaMs),
        };
        break;
      }
      case 'set-scene': {
        this.control = { ...this.control, sceneId: findScene(command.sceneId).id };
        break;
      }
      case 'set-theme': {
        this.control = { ...this.control, themeId: findTheme(command.themeId).id };
        break;
      }
      case 'set-cam-mode': {
        this.control = { ...this.control, camMode: command.camMode };
        break;
      }
      case 'replay-speed': {
        const speed = Math.min(60, Math.max(0.25, command.speed));
        this.clock.setScale(speed);
        this.control = { ...this.control, timeScale: this.clock.scale };
        break;
      }
      case 'replay-seek': {
        // Traité par le fournisseur, pas ici.
        return false;
      }
    }

    if (shallowEqual(before, this.control)) return false;
    this.broadcast({ type: 'control', control: this.control });
    return true;
  }
}

/** De 0 à 5 minutes. Au-delà, c'est une erreur de saisie, pas une intention. */
function clampDelay(ms: number): number {
  return Math.min(300_000, Math.max(0, Math.round(ms)));
}

function shallowEqual(a: ControlState, b: ControlState): boolean {
  return (Object.keys(a) as (keyof ControlState)[]).every((k) => a[k] === b[k]);
}
