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
  DEFAULT_SCENE_MODE,
  estContexte,
  findScene,
  findTheme,
  RECUL_CONTEXTE,
  SCENE_MODES,
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

  /** Appelé à chaque changement de l'état de contrôle, pour l'enregistrer. */
  onControlChange: ((control: ControlState) => void) | null = null;

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
    for (const brut of incoming) {
      if (this.seen.has(brut.seq)) continue;
      this.seen.add(brut.seq);
      // Le contexte — équipes, compositions, cotes, classement — ne spoile
      // rien et n'a donc aucune raison d'attendre le décalage. Sans cet
      // antidatage, le plateau reste vide pendant toute la durée du décalage
      // au démarrage, et une relance en pleine émission vide l'écran.
      const event = estContexte(brut.kind)
        ? ({ ...brut, t: brut.t - RECUL_CONTEXTE } as MatchEvent)
        : brut;
      this.events.push(event);
      fresh.push(event);
    }
    if (fresh.length === 0) return;

    this.events.sort((a, b) => a.t - b.t || a.seq - b.seq);
    this.broadcast({ type: 'events', events: fresh });
  }

  /**
   * Vide la timeline.
   *
   * Changer de match ne doit RIEN garder du précédent — et pas seulement les
   * événements : `seen` est indexé sur `seq`, et un nouveau fournisseur
   * repart de zéro. Sans ce vidage, ses premiers événements seraient pris
   * pour des doublons et jetés en silence.
   */
  reset(): void {
    this.events = [];
    this.seen.clear();
  }

  /** Demande aux pages de se reconstruire depuis zéro. */
  demanderRechargement(): void {
    this.broadcast({ type: 'reload' });
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
      case 'set-source': {
        // On borne ici aussi : une régie ne doit pas pouvoir inscrire
        // n'importe quoi dans l'état qu'on va enregistrer sur disque.
        const s = command.source;
        this.control = {
          ...this.control,
          source: {
            provider: String(s.provider ?? 'espn').slice(0, 32),
            league: s.league ? String(s.league).slice(0, 64) : null,
            eventId: s.eventId ? String(s.eventId).slice(0, 64) : null,
            label: s.label ? String(s.label).slice(0, 120) : null,
          },
        };
        break;
      }
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
      case 'set-scene-mode': {
        // Un mode inconnu retombe sur « direct » plutôt que de vider le
        // plateau : en régie, une faute de frappe ne doit pas couper l'antenne.
        const connu = SCENE_MODES.some((m) => m.id === command.mode);
        this.control = {
          ...this.control,
          sceneMode: connu ? command.mode : DEFAULT_SCENE_MODE,
        };
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
      case 'set-insert-mode': {
        this.control = { ...this.control, insertMode: command.insertMode };
        break;
      }
      case 'force-insert': {
        // Imposer un insert implique de vouloir des inserts.
        this.control = {
          ...this.control,
          insertForce: command.insertId,
          insertMode: command.insertId ? 'auto' : this.control.insertMode,
        };
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
    this.onControlChange?.(this.control);
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
