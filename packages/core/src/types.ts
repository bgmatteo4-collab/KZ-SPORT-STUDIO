/**
 * Le modèle interne du match. Indépendant de tout fournisseur.
 *
 * RÈGLE : un adaptateur traduit vers ce modèle, jamais l'inverse. Si Sportmonks
 * change son format demain, seul l'adaptateur bouge. Rien dans le rendu ne
 * connaît le nom d'un fournisseur.
 */

export type Side = 'home' | 'away';

/** [domicile, extérieur] — partout, dans cet ordre. */
export type Pair = readonly [number, number];

export type MatchPhase =
  | 'pre'
  | 'first_half'
  | 'half_time'
  | 'second_half'
  | 'extra_break'
  | 'extra_first'
  | 'extra_half'
  | 'extra_second'
  | 'penalties'
  | 'full_time';

/** Minute à laquelle chaque période démarre son chrono affiché. */
export const PHASE_CLOCK_START: Record<MatchPhase, number> = {
  pre: 0,
  first_half: 0,
  half_time: 45 * 60_000,
  second_half: 45 * 60_000,
  extra_break: 90 * 60_000,
  extra_first: 90 * 60_000,
  extra_half: 105 * 60_000,
  extra_second: 105 * 60_000,
  penalties: 120 * 60_000,
  full_time: 90 * 60_000,
};

/** Minute réglementaire de fin de chaque période — sert au temps additionnel. */
export const PHASE_CLOCK_END: Partial<Record<MatchPhase, number>> = {
  first_half: 45 * 60_000,
  second_half: 90 * 60_000,
  extra_first: 105 * 60_000,
  extra_second: 120 * 60_000,
};

export const PHASE_LABEL: Record<MatchPhase, string> = {
  pre: 'Avant-match',
  first_half: '1re période',
  half_time: 'Mi-temps',
  second_half: '2e période',
  extra_break: 'Fin du temps réglementaire',
  extra_first: 'Prolongation, 1re',
  extra_half: 'Mi-temps de prolongation',
  extra_second: 'Prolongation, 2e',
  penalties: 'Tirs au but',
  full_time: 'Terminé',
};

export type AttackIntensity = 'none' | 'attack' | 'dangerous';
export type CardKind = 'yellow' | 'second_yellow' | 'red';

export interface Team {
  id: string;
  /** Nom complet : « Real Madrid Club de Fútbol ». */
  name: string;
  /** Nom d'antenne : « Real Madrid ». */
  short: string;
  /** Trigramme du scorebug : « RMA ». */
  abbr: string;
  color: string;
  colorAlt?: string;
  kit?: Kit;
  crest?: string;
}

export interface Player {
  id: string;
  name: string;
  /** Nom d'antenne, souvent le seul affichable : « Vinícius ». */
  short: string;
  number: number;
  position?: string;
}

export interface MatchStats {
  possession: Pair;
  shots: Pair;
  shotsOnTarget: Pair;
  corners: Pair;
  fouls: Pair;
  offsides: Pair;
  /**
   * ABSENT quand le fournisseur n'en publie pas — ESPN, par exemple, et le
   * palier gratuit de Sportmonks. Ce n'est pas un détail de typage : afficher
   * « 0.00 » affirme que les deux équipes n'ont rien créé, ce qui est un
   * mensonge à l'antenne. L'absence doit être représentable pour pouvoir être
   * dite.
   */
  xg?: Pair;
  passes: Pair;
  passAccuracy: Pair;
  yellowCards: Pair;
  redCards: Pair;
}

export const EMPTY_STATS: MatchStats = {
  possession: [50, 50],
  shots: [0, 0],
  shotsOnTarget: [0, 0],
  corners: [0, 0],
  fouls: [0, 0],
  offsides: [0, 0],
  passes: [0, 0],
  passAccuracy: [0, 0],
  yellowCards: [0, 0],
  redCards: [0, 0],
};

export interface MatchMeta {
  id: string;
  competition: string;
  /** Identifiant d'habillage : « ucl », « ligue1 »… */
  competitionTheme: string;
  /**
   * Le code de la compétition chez le fournisseur : « fra.1 », « uefa.champions ».
   * Il sert à retrouver un emblème déposé localement, qui prime sur celui du
   * fournisseur — ESPN date les siens de 2019 et ne les a jamais remis à jour.
   */
  competitionId?: string;
  /**
   * L'URL du logo de la compétition, quand le fournisseur en donne une. Le
   * cartouche doré porte alors l'emblème plutôt que seulement des lettres —
   * et retombe sur le nom écrit si l'image ne charge pas.
   */
  competitionCrest?: string;
  round?: string;
  venue?: string;
  home: Team;
  away: Team;
  /** Coup d'envoi prévu, en temps mural UTC. */
  kickoff: number;
}

// ───────────────────────────────── Événements ─────────────────────────────────

/**
 * `t` est un temps MURAL en ms UTC : l'instant où la chose s'est produite dans
 * la réalité. C'est ce qui rend le décalage anti-spoiler possible.
 *
 * Dans un fichier de `fixtures/`, `t` est relatif au coup d'envoi ; le rejoueur
 * le ramène en absolu. C'est la seule exception, et elle est documentée ici.
 *
 * `seq` est monotone par match. Il sert à la reprise après coupure et rend les
 * événements idempotents : recevoir deux fois le même seq ne change rien.
 */
interface EventBase {
  seq: number;
  t: number;
}

export type MatchEvent =
  | (EventBase & { kind: 'meta'; payload: MatchMeta })
  | (EventBase & { kind: 'phase'; payload: { phase: MatchPhase } })
  | (EventBase & { kind: 'clock'; payload: ClockAnchorPayload })
  | (EventBase & { kind: 'score'; payload: { score: Pair } })
  | (EventBase & { kind: 'goal'; payload: GoalPayload })
  | (EventBase & { kind: 'card'; payload: { side: Side; player?: Player; card: CardKind } })
  | (EventBase & { kind: 'substitution'; payload: { side: Side; out?: Player; in?: Player } })
  | (EventBase & { kind: 'corner'; payload: { side: Side } })
  | (EventBase & { kind: 'shot'; payload: ShotPayload })
  | (EventBase & { kind: 'free_kick'; payload: { side: Side } })
  | (EventBase & { kind: 'offside'; payload: { side: Side } })
  | (EventBase & { kind: 'penalty_awarded'; payload: { side: Side } })
  | (EventBase & { kind: 'attack'; payload: { side: Side | null; intensity: AttackIntensity } })
  | (EventBase & { kind: 'ball'; payload: { x: number; y: number } })
  | (EventBase & { kind: 'stats'; payload: Partial<MatchStats> })
  | (EventBase & { kind: 'lineup'; payload: LineupPayload })
  | (EventBase & { kind: 'rating'; payload: { side: Side; ratings: Record<string, number> } })
  | (EventBase & { kind: 'other_matches'; payload: { matches: OtherMatch[] } })
  | (EventBase & { kind: 'standings'; payload: { rows: StandingRow[] } })
  | (EventBase & { kind: 'odds'; payload: Odds })
  | (EventBase & { kind: 'audience'; payload: { viewers: number; likes: number } });

export type MatchEventKind = MatchEvent['kind'];

/**
 * Les familles d'événements qui ne révèlent RIEN du direct.
 *
 * Le décalage anti-spoiler existe pour qu'un but n'apparaisse pas à l'écran
 * avant que le spectateur ne le voie. Mais le nom des équipes, le stade, la
 * composition annoncée une heure avant, les cotes et le classement ne spoilent
 * rien : ils étaient vrais bien avant le coup d'envoi.
 *
 * Les soumettre au décalage a une conséquence qu'on ne voit qu'en situation :
 * au démarrage, le plateau reste VIDE pendant toute la durée du décalage. Et
 * un serveur relancé en pleine émission vide l'écran pendant une minute.
 */
export const CONTEXTE: readonly MatchEventKind[] = ['meta', 'lineup', 'odds', 'standings'];

export function estContexte(kind: MatchEventKind): boolean {
  return CONTEXTE.includes(kind);
}

/**
 * De combien on antidate le contexte. Une heure : largement plus que tout
 * décalage qu'on réglera jamais en régie, et sans effet sur un rejeu, dont le
 * contexte est déjà daté du coup d'envoi.
 */
export const RECUL_CONTEXTE = 3_600_000;

export interface ClockAnchorPayload {
  /** Chrono du match à l'instant `t` de l'événement. */
  matchMs: number;
  running: boolean;
  phase: MatchPhase;
  /** Temps additionnel annoncé, en minutes. */
  addedMinutes?: number;
}

/**
 * L'issue d'une frappe. C'est elle qui porte le sens : un tir contré et un tir
 * à côté comptent tous deux comme « non cadré » dans un tableau, mais ils ne
 * racontent pas la même chose sur une carte.
 */
export type ShotOutcome = 'goal' | 'on_target' | 'blocked' | 'off_target';

export interface ShotPayload {
  side: Side;
  /** Conservé pour les sources qui ne savent dire que ça. */
  onTarget: boolean;
  outcome?: ShotOutcome;
  /**
   * Où la frappe a été tentée, RELATIVEMENT au but attaqué, sur [0,100] :
   * `x` 100 = la ligne de but adverse, `y` 50 = l'axe. Les deux équipes
   * tirent donc vers des `x` élevés — c'est au dessin de les mettre face à
   * face. Absent quand le fournisseur ne donne pas la position.
   */
  x?: number;
  y?: number;
  player?: Player;
  xg?: number;
}

export interface GoalPayload {
  side: Side;
  scorer?: Player;
  assist?: Player;
  ownGoal?: boolean;
  penalty?: boolean;
  /** Score APRÈS le but. Autoritaire : on ne l'incrémente jamais soi-même. */
  score: Pair;
}

/** Un autre match en cours, pour le multiplex. */
export interface OtherMatch {
  id: string;
  /** Minute d'antenne, déjà formatée : « 69 », « 45+2 », « MT ». */
  minute: string;
  live: boolean;
  home: TeamBrief;
  away: TeamBrief;
  score: Pair;
}

/** Le minimum pour dessiner un écu et un nom. */
export interface TeamBrief {
  abbr: string;
  short: string;
  color: string;
  colorAlt?: string;
  /** Le maillot. Uni par défaut : rayer tout le monde est faux et se voit. */
  kit?: Kit;
  /**
   * L'URL d'un vrai écusson, quand le fournisseur en donne une. Rien n'est
   * rangé dans le dépôt — et si l'image ne charge pas, l'écu dessiné reste
   * dessous.
   */
  crest?: string;
}

export type Kit = 'plain' | 'striped' | 'hoops';

export interface StandingRow {
  rank: number;
  team: TeamBrief;
  played: number;
  diff: number;
  points: number;
  /**
   * Zone de qualification, de barrage ou de relégation, pour le bloc de rang.
   * `win` qualifié, `play` barragiste, `lose` relégable.
   */
  zone: 'win' | 'play' | 'lose' | null;
}

/** Cotes 1N2. */
export interface Odds {
  home: number;
  draw: number;
  away: number;
  bookmaker?: string;
}

export interface LineupPayload {
  side: Side;
  formation: string;
  starters: Player[];
  bench: Player[];
  coach?: string;
}

// ────────────────────────────── Faits consolidés ──────────────────────────────

export interface GoalEntry extends GoalPayload {
  seq: number;
  t: number;
  /** Minute d'antenne : « 45+2 ». */
  minute: string;
}

export interface CardEntry {
  seq: number;
  t: number;
  minute: string;
  side: Side;
  player?: Player;
  card: CardKind;
}

/** Une frappe consolidée, pour la carte des tirs. */
export interface ShotEntry extends ShotPayload {
  seq: number;
  t: number;
  /** Minute d'antenne : « 45+2 ». */
  minute: string;
}

export interface SubEntry {
  seq: number;
  t: number;
  minute: string;
  side: Side;
  out?: Player;
  in?: Player;
}

// ─────────────────────────────────── État ───────────────────────────────────

export interface ClockState {
  /** Ancrage : chrono match à `wallMs`. */
  wallMs: number;
  matchMs: number;
  running: boolean;
  phase: MatchPhase;
  addedMinutes: number;
}

/**
 * Le résultat du réducteur. Jamais construit à la main, jamais muté.
 * C'est une photographie du match à l'instant `t`.
 */
export interface MatchState {
  /** L'instant représenté, en temps mural. */
  t: number;
  /** Dernier `seq` consommé. */
  lastSeq: number;
  meta: MatchMeta | null;
  phase: MatchPhase;
  clock: ClockState;
  /**
   * Chrono match calculé à `t`, en ms. Déterministe : même `t`, même valeur.
   * La monotonie et le lissage sont la responsabilité de `SmoothClock`, côté
   * rendu — le réducteur, lui, doit rester pur.
   */
  clockMs: number;
  score: Pair;
  goals: GoalEntry[];
  cards: CardEntry[];
  subs: SubEntry[];
  /**
   * Toutes les frappes, avec leur place sur le terrain quand on l'a.
   * C'est la matière de la carte des tirs — l'information qui dit le mieux ce
   * qu'on rate quand on ne voit pas les images.
   */
  shots: ShotEntry[];
  stats: MatchStats;
  lineups: { home: LineupPayload | null; away: LineupPayload | null };
  ratings: { home: Record<string, number>; away: Record<string, number> };
  /**
   * NULL tant qu'aucun fournisseur n'a donné de position. Le centre du terrain
   * est une position comme une autre : s'en servir par défaut dessine un
   * ballon au rond central et fait croire au spectateur qu'on suit le jeu.
   */
  ball: { x: number; y: number } | null;
  attack: { side: Side | null; intensity: AttackIntensity };
  otherMatches: OtherMatch[];
  standings: StandingRow[];
  odds: Odds | null;
  audience: { viewers: number; likes: number } | null;
  /** Pression décroissante par camp, pour le pressure index. */
  pressure: { home: number; away: number };
  /** Historique pondéré des temps forts, pour tracer la courbe de momentum. */
  pressureLog: PressureSample[];
}

export interface PressureSample {
  t: number;
  side: Side;
  weight: number;
}
