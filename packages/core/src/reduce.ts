/**
 * Le réducteur. La pièce la plus importante du projet.
 *
 *   état = reduce(événements, t)
 *
 * RÈGLES ABSOLUES, sans quoi tout le reste s'écroule :
 *   • Aucun `Date.now()` ici. Aucun accès réseau. Aucun effet de bord.
 *   • Deux appels avec les mêmes arguments rendent le même résultat.
 *   • Rien n'est jamais incrémenté à l'aveugle : le score vient du fournisseur.
 *
 * Conséquence pratique : on peut recalculer l'état complet à n'importe quel
 * instant, depuis zéro. C'est ce qui fait qu'un F5 en pleine mi-temps répare
 * tout en moins d'une seconde.
 */

import { matchClockAt, minuteLabel } from './clock.js';
import {
  EMPTY_STATS,
  type MatchEvent,
  type MatchState,
  type MatchStats,
  type Pair,
  type PressureSample,
  type Side,
} from './types.js';

/** Fenêtre et demi-vie du pressure index. */
const PRESSURE_WINDOW_MS = 10 * 60_000;
const PRESSURE_HALF_LIFE_MS = 2.5 * 60_000;

/** Poids d'un temps fort dans le pressure index. */
const PRESSURE_WEIGHT = {
  goal: 4,
  penalty_awarded: 5,
  shot_on_target: 3,
  shot: 2,
  corner: 2,
  dangerous: 2,
  attack: 1,
  free_kick: 1,
} as const;

export function initialState(t = 0): MatchState {
  return {
    t,
    lastSeq: -1,
    meta: null,
    phase: 'pre',
    clock: { wallMs: t, matchMs: 0, running: false, phase: 'pre', addedMinutes: 0 },
    clockMs: 0,
    score: [0, 0],
    goals: [],
    cards: [],
    subs: [],
    stats: { ...EMPTY_STATS },
    lineups: { home: null, away: null },
    ratings: { home: {}, away: {} },
    otherMatches: [],
    standings: [],
    odds: null,
    audience: null,
    ball: null,
    attack: { side: null, intensity: 'none' },
    pressure: { home: 0, away: 0 },
    pressureLog: [],
  };
}

const sideIndex = (side: Side): 0 | 1 => (side === 'home' ? 0 : 1);

function bump(pair: Pair, side: Side, by = 1): Pair {
  const i = sideIndex(side);
  return i === 0 ? [pair[0] + by, pair[1]] : [pair[0], pair[1] + by];
}

/**
 * Applique un événement à un brouillon, en place.
 *
 * Muter est volontaire : `reduce` crée le brouillon, le remplit et le rend. Vu
 * de l'extérieur la fonction reste pure, mais on évite d'allouer un état
 * complet par événement — ce qui compte quand on replie 4 000 événements.
 */
function applyInto(draft: MatchState, event: MatchEvent): void {
  draft.lastSeq = Math.max(draft.lastSeq, event.seq);

  switch (event.kind) {
    case 'meta': {
      draft.meta = event.payload;
      break;
    }

    case 'phase': {
      draft.phase = event.payload.phase;
      draft.clock.phase = event.payload.phase;
      // Changement de période : le temps additionnel annoncé ne vaut plus.
      draft.clock.addedMinutes = 0;
      break;
    }

    case 'clock': {
      const { matchMs, running, phase, addedMinutes } = event.payload;
      draft.clock = {
        wallMs: event.t,
        matchMs,
        running,
        phase,
        addedMinutes: addedMinutes ?? draft.clock.addedMinutes,
      };
      draft.phase = phase;
      break;
    }

    case 'score': {
      draft.score = event.payload.score;
      break;
    }

    case 'goal': {
      const minute = minuteLabel(matchClockAt(draft.clock, event.t), draft.phase);
      draft.goals = [...draft.goals, { ...event.payload, seq: event.seq, t: event.t, minute }];
      // Le score du fournisseur fait foi. On ne compte pas les buts soi-même :
      // un but annulé par la VAR deviendrait une divergence permanente.
      draft.score = event.payload.score;
      pushPressure(draft, event.t, event.payload.side, PRESSURE_WEIGHT.goal);
      break;
    }

    case 'card': {
      const minute = minuteLabel(matchClockAt(draft.clock, event.t), draft.phase);
      draft.cards = [...draft.cards, { ...event.payload, seq: event.seq, t: event.t, minute }];
      const stats = { ...draft.stats };
      if (event.payload.card === 'yellow') {
        stats.yellowCards = bump(stats.yellowCards, event.payload.side);
      } else {
        stats.redCards = bump(stats.redCards, event.payload.side);
      }
      draft.stats = stats;
      break;
    }

    case 'substitution': {
      const minute = minuteLabel(matchClockAt(draft.clock, event.t), draft.phase);
      draft.subs = [...draft.subs, { ...event.payload, seq: event.seq, t: event.t, minute }];
      break;
    }

    case 'corner': {
      draft.stats = { ...draft.stats, corners: bump(draft.stats.corners, event.payload.side) };
      pushPressure(draft, event.t, event.payload.side, PRESSURE_WEIGHT.corner);
      break;
    }

    case 'shot': {
      const stats = { ...draft.stats };
      stats.shots = bump(stats.shots, event.payload.side);
      if (event.payload.onTarget) {
        stats.shotsOnTarget = bump(stats.shotsOnTarget, event.payload.side);
      }
      if (event.payload.xg) {
        // `xg` n'existe que si un fournisseur en a donné : on part de zéro au
        // premier tir chiffré, pas avant.
        stats.xg = bump(stats.xg ?? [0, 0], event.payload.side, event.payload.xg);
      }
      draft.stats = stats;
      pushPressure(
        draft,
        event.t,
        event.payload.side,
        event.payload.onTarget ? PRESSURE_WEIGHT.shot_on_target : PRESSURE_WEIGHT.shot,
      );
      break;
    }

    case 'free_kick': {
      pushPressure(draft, event.t, event.payload.side, PRESSURE_WEIGHT.free_kick);
      break;
    }

    case 'offside': {
      draft.stats = { ...draft.stats, offsides: bump(draft.stats.offsides, event.payload.side) };
      break;
    }

    case 'penalty_awarded': {
      pushPressure(draft, event.t, event.payload.side, PRESSURE_WEIGHT.penalty_awarded);
      break;
    }

    case 'attack': {
      draft.attack = { side: event.payload.side, intensity: event.payload.intensity };
      if (event.payload.side && event.payload.intensity !== 'none') {
        const weight =
          event.payload.intensity === 'dangerous'
            ? PRESSURE_WEIGHT.dangerous
            : PRESSURE_WEIGHT.attack;
        pushPressure(draft, event.t, event.payload.side, weight);
      }
      break;
    }

    case 'ball': {
      draft.ball = { x: event.payload.x, y: event.payload.y };
      break;
    }

    case 'stats': {
      draft.stats = { ...draft.stats, ...stripUndefined(event.payload) };
      break;
    }

    case 'lineup': {
      draft.lineups = { ...draft.lineups, [event.payload.side]: event.payload };
      break;
    }

    case 'other_matches': {
      draft.otherMatches = event.payload.matches;
      break;
    }

    case 'standings': {
      draft.standings = event.payload.rows;
      break;
    }

    case 'odds': {
      draft.odds = event.payload;
      break;
    }

    case 'audience': {
      draft.audience = event.payload;
      break;
    }

    case 'rating': {
      draft.ratings = {
        ...draft.ratings,
        [event.payload.side]: { ...draft.ratings[event.payload.side], ...event.payload.ratings },
      };
      break;
    }
  }
}

function stripUndefined(patch: Partial<MatchStats>): Partial<MatchStats> {
  const out: Partial<MatchStats> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

function pushPressure(draft: MatchState, t: number, side: Side, weight: number): void {
  draft.pressureLog.push({ t, side, weight });
  // Borné : un match n'a pas besoin de garder une heure de temps forts.
  if (draft.pressureLog.length > 4000) draft.pressureLog.shift();
}

/** Calcule ce qui dépend de `t` plutôt que des événements. */
function finalise(draft: MatchState, t: number): MatchState {
  draft.t = t;
  draft.clockMs = matchClockAt(draft.clock, t);

  let home = 0;
  let away = 0;
  for (let i = draft.pressureLog.length - 1; i >= 0; i -= 1) {
    const sample = draft.pressureLog[i]!;
    const age = t - sample.t;
    if (age > PRESSURE_WINDOW_MS) break;
    if (age < 0) continue;
    const decayed = sample.weight * Math.pow(0.5, age / PRESSURE_HALF_LIFE_MS);
    if (sample.side === 'home') home += decayed;
    else away += decayed;
  }
  draft.pressure = { home, away };

  return draft;
}

/**
 * Replie la timeline jusqu'à l'instant `t`.
 * `events` DOIT être trié par `t` croissant.
 */
export function reduce(events: readonly MatchEvent[], t: number): MatchState {
  const draft = initialState(t);
  for (const event of events) {
    if (event.t > t) break;
    applyInto(draft, event);
  }
  return finalise(draft, t);
}

/**
 * Le même calcul, mais incrémental.
 *
 * Avancer dans le temps ne relit que les nouveaux événements. Reculer — ce qui
 * arrive quand on augmente le délai anti-spoiler — force un repli complet, et
 * c'est normal : c'est rare et ça coûte quelques millisecondes.
 *
 * `at()` rend une vue vivante, valable jusqu'au prochain appel. Contrat assumé :
 * un moteur de rendu lit l'état immédiatement, à chaque image, et n'a aucune
 * raison d'en garder une référence.
 */
export class StateCursor {
  private events: MatchEvent[] = [];
  private draft = initialState(0);
  private index = 0;
  private seen = new Set<number>();

  /** Fusionne des événements dans la timeline. Idempotent par `seq`. */
  ingest(incoming: readonly MatchEvent[]): number {
    let added = 0;
    let earliest = Number.POSITIVE_INFINITY;

    for (const event of incoming) {
      if (this.seen.has(event.seq)) continue;
      this.seen.add(event.seq);
      this.events.push(event);
      earliest = Math.min(earliest, event.t);
      added += 1;
    }

    if (added === 0) return 0;

    this.events.sort((a, b) => a.t - b.t || a.seq - b.seq);

    // Un événement arrivé en retard, antérieur au curseur, invalide le repli.
    if (earliest <= this.draft.t) this.invalidate();

    return added;
  }

  replace(events: readonly MatchEvent[]): void {
    this.events = [...events].sort((a, b) => a.t - b.t || a.seq - b.seq);
    this.seen = new Set(this.events.map((e) => e.seq));
    this.invalidate();
  }

  private invalidate(): void {
    this.draft = initialState(0);
    this.index = 0;
  }

  at(t: number): MatchState {
    if (t < this.draft.t) this.invalidate();

    while (this.index < this.events.length) {
      const event = this.events[this.index]!;
      if (event.t > t) break;
      applyInto(this.draft, event);
      this.index += 1;
    }

    return finalise(this.draft, t);
  }

  get size(): number {
    return this.events.length;
  }

  get lastSeq(): number {
    return this.events.length === 0 ? -1 : Math.max(...this.events.map((e) => e.seq));
  }

  get span(): { from: number; to: number } | null {
    if (this.events.length === 0) return null;
    return { from: this.events[0]!.t, to: this.events[this.events.length - 1]!.t };
  }

  snapshot(): readonly MatchEvent[] {
    return this.events;
  }
}
