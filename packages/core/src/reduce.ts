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
import { estBut, type FaitEntry, type FaitKind, POIDS_POUSSEE, type PousseeKind } from './faits.js';
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

/**
 * Combien de faits le fil retient.
 *
 * Un match en produit entre cent et deux cents. On garde tout : c'est une
 * liste d'objets plats, elle coûte quelques dizaines de kilo-octets, et la
 * tronquer empêcherait le recap de fin de match de remonter à la 3e minute.
 * La borne n'est là que contre une source qui déraillerait.
 */
const FIL_MAX = 600;

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
    shots: [],
    feed: [],
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
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute,
        side: event.payload.side,
        kind: event.payload.ownGoal ? 'own_goal' : event.payload.penalty ? 'penalty_goal' : 'goal',
        ...(event.payload.scorer ? { player: event.payload.scorer } : {}),
        ...(event.payload.assist ? { second: event.payload.assist } : {}),
        score: event.payload.score,
      });
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
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute,
        side: event.payload.side,
        kind: event.payload.card,
        ...(event.payload.player ? { player: event.payload.player } : {}),
      });
      break;
    }

    case 'substitution': {
      const minute = minuteLabel(matchClockAt(draft.clock, event.t), draft.phase);
      draft.subs = [...draft.subs, { ...event.payload, seq: event.seq, t: event.t, minute }];
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute,
        side: event.payload.side,
        kind: 'sub',
        ...(event.payload.out ? { player: event.payload.out } : {}),
        ...(event.payload.in ? { second: event.payload.in } : {}),
      });
      break;
    }

    case 'corner': {
      draft.stats = { ...draft.stats, corners: bump(draft.stats.corners, event.payload.side) };
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute: minuteLabel(matchClockAt(draft.clock, event.t), draft.phase),
        side: event.payload.side,
        kind: 'corner',
      });
      break;
    }

    case 'shot': {
      const minute = minuteLabel(matchClockAt(draft.clock, event.t), draft.phase);
      const stats = { ...draft.stats };
      stats.shots = bump(stats.shots, event.payload.side);
      if (event.payload.onTarget) {
        stats.shotsOnTarget = bump(stats.shotsOnTarget, event.payload.side);
      }
      // La frappe est CONSERVÉE, pas seulement comptée : un compteur dit
      // combien, une carte dit d'où — et c'est « d'où » qui manque le plus
      // quand on ne voit pas les images.
      draft.shots = [...draft.shots, { ...event.payload, seq: event.seq, t: event.t, minute }];
      if (event.payload.xg) {
        // `xg` n'existe que si un fournisseur en a donné : on part de zéro au
        // premier tir chiffré, pas avant.
        stats.xg = bump(stats.xg ?? [0, 0], event.payload.side, event.payload.xg);
      }
      draft.stats = stats;

      const place = {
        ...(event.payload.x !== undefined ? { x: event.payload.x } : {}),
        ...(event.payload.y !== undefined ? { y: event.payload.y } : {}),
      };

      // Une frappe qui FINIT au fond est déjà au fil, portée par l'événement
      // « but » — mais sans position, parce qu'un but n'en transporte pas. On
      // ne crée donc pas de seconde ligne : on va compléter la première. C'est
      // ce qui fait écrire « But — Mbappé, dans la surface » plutôt que « But
      // — Mbappé » suivi d'un « Tir cadré » qui parle du même ballon.
      if (event.payload.outcome === 'goal') {
        if (place.x !== undefined) attacherLaPlace(draft, event.t, event.payload.side, place);
        break;
      }

      const kind: FaitKind =
        event.payload.outcome === 'blocked'
          ? 'shot_blocked'
          : event.payload.outcome === 'on_target' || event.payload.onTarget
            ? 'shot_on'
            : 'shot_off';
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute,
        side: event.payload.side,
        kind,
        ...(event.payload.player ? { player: event.payload.player } : {}),
        ...place,
      });
      break;
    }

    case 'free_kick': {
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute: minuteLabel(matchClockAt(draft.clock, event.t), draft.phase),
        side: event.payload.side,
        kind: 'free_kick',
      });
      break;
    }

    case 'offside': {
      draft.stats = { ...draft.stats, offsides: bump(draft.stats.offsides, event.payload.side) };
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute: minuteLabel(matchClockAt(draft.clock, event.t), draft.phase),
        side: event.payload.side,
        kind: 'offside',
      });
      break;
    }

    case 'penalty_awarded': {
      inscrire(draft, {
        seq: event.seq,
        t: event.t,
        minute: minuteLabel(matchClockAt(draft.clock, event.t), draft.phase),
        side: event.payload.side,
        kind: 'penalty_awarded',
      });
      break;
    }

    case 'attack': {
      draft.attack = { side: event.payload.side, intensity: event.payload.intensity };
      if (event.payload.side && event.payload.intensity !== 'none') {
        // Un temps fort n'entre pas au fil : il n'a ni auteur ni instant
        // précis. Il pèse seulement sur la courbe.
        pousser(
          draft,
          event.t,
          event.payload.side,
          event.payload.intensity === 'dangerous' ? 'attaque_dangereuse' : 'attaque',
        );
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

/**
 * Inscrit un fait au fil — et, s'il crée du danger, dans la pression.
 *
 * UN SEUL point d'entrée, volontairement. Avant, la courbe de momentum et les
 * listes de faits étaient remplies par deux chemins séparés : la courbe
 * pouvait monter sans qu'aucune ligne à l'écran ne l'explique, et c'est le
 * genre de détail qui fait passer une régie pour cassée. Ici, tout ce qui
 * pousse la courbe a par construction sa ligne au fil, et le poids vient de
 * la même table que le libellé.
 */
function inscrire(draft: MatchState, fait: FaitEntry): void {
  draft.feed.push(fait);
  if (draft.feed.length > FIL_MAX) draft.feed.shift();
  if (POIDS_POUSSEE[fait.kind] > 0) pousser(draft, fait.t, fait.side, fait.kind);
}

function pousser(draft: MatchState, t: number, side: Side, kind: PousseeKind): void {
  draft.pressureLog.push({ t, side, weight: POIDS_POUSSEE[kind], kind });
  // Borné : un match n'a pas besoin de garder une heure de temps forts.
  if (draft.pressureLog.length > 4000) draft.pressureLog.shift();
}

/** Fenêtre de rattachement d'une frappe au but qu'elle a produit. */
const MEME_BALLON_MS = 90_000;

/**
 * Complète la dernière ligne « but » de ce camp avec la position de la frappe.
 *
 * Le but arrive des faits marquants, la position du fil du commentaire : deux
 * sources pour un seul ballon. On les recoud par le camp et l'instant, et on
 * s'arrête à la première ligne déjà placée — sinon un second but dans la même
 * minute hériterait de la position du premier.
 */
function attacherLaPlace(
  draft: MatchState,
  t: number,
  side: Side,
  place: { x?: number; y?: number },
): void {
  for (let i = draft.feed.length - 1; i >= 0; i -= 1) {
    const fait = draft.feed[i]!;
    if (t - fait.t > MEME_BALLON_MS) return;
    if (fait.side !== side || !estBut(fait.kind)) continue;
    if (fait.x !== undefined) return;
    Object.assign(fait, place);
    return;
  }
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
