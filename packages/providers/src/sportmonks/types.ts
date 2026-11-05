/**
 * La forme des réponses Sportmonks v3, telle que la documentation la décrit.
 *
 * TOUT EST OPTIONNEL ET TOLÉRANT. Ce n'est pas de la paresse : une API qu'on
 * n'a pas encore vue tourner ne se modélise pas en types stricts sans mentir.
 * Trois points restent non confirmés par la documentation — ils sont marqués
 * INCERTAIN et traités défensivement. L'enregistreur (`pnpm record`) capture
 * une réponse réelle, et c'est elle qui tranchera.
 *
 * Référence : https://docs.sportmonks.com/v3 — lue le 5 novembre 2026.
 */

/** Enveloppe commune à toutes les réponses. */
export interface Enveloppe<T> {
  data?: T;
  message?: string;
  rate_limit?: {
    resets_in_seconds?: number;
    remaining?: number;
    requested_entity?: string;
  };
}

export interface SmFixture {
  id?: number;
  name?: string;
  starting_at?: string;
  starting_at_timestamp?: number;
  state_id?: number;
  league_id?: number;
  round_id?: number;
  venue_id?: number;

  // Tout ce qui suit n'existe que si demandé par `include`.
  participants?: SmParticipant[];
  scores?: SmScore[];
  periods?: SmPeriod[];
  events?: SmEvent[];
  statistics?: SmStatistic[];
  lineups?: SmLineup[];
  ballCoordinates?: SmBall[];
  league?: { id?: number; name?: string; image_path?: string };
  round?: { id?: number; name?: string };
  venue?: { id?: number; name?: string };
  state?: { id?: number; state?: string; name?: string };
}

/**
 * INCERTAIN : la documentation ne précise pas où vit « domicile / extérieur ».
 * `meta.location` est la convention annoncée par la communauté, mais la page
 * de l'entité Team n'était pas lisible. On essaie plusieurs emplacements.
 */
export interface SmParticipant {
  id?: number;
  name?: string;
  short_code?: string;
  image_path?: string;
  meta?: { location?: string; position?: number; winner?: boolean };
  location?: string;
}

/**
 * INCERTAIN : les clés internes de `score` ne sont pas documentées, et les
 * valeurs possibles de `description` non plus au-delà de « 1ST_HALF ».
 */
export interface SmScore {
  id?: number;
  fixture_id?: number;
  type_id?: number;
  participant_id?: number;
  description?: string;
  score?: { goals?: number; participant?: string };
}

export interface SmPeriod {
  id?: number;
  type_id?: number;
  started?: number;
  ended?: number | null;
  ticking?: boolean;
  minutes?: number;
  seconds?: number;
  time_added?: number | null;
  period_length?: number;
  counts_from?: number;
  description?: string;
  sort_order?: number;
  has_timer?: boolean;
}

export interface SmEvent {
  id?: number;
  fixture_id?: number;
  period_id?: number;
  participant_id?: number;
  type_id?: number;
  sub_type_id?: number;
  section?: string;
  player_id?: number;
  related_player_id?: number;
  player_name?: string;
  related_player_name?: string;
  /** Le score APRÈS l'événement, pour les types « but ». Exemple : « 2-1 ». */
  result?: string;
  info?: string;
  addition?: string;
  minute?: number;
  extra_minute?: number | null;
  sort_order?: number;
}

/** INCERTAIN : la clé interne de `data`. On essaie `value`, puis le nombre nu. */
export interface SmStatistic {
  id?: number;
  type_id?: number;
  participant_id?: number;
  location?: string;
  data?: { value?: number } | number;
}

export interface SmLineup {
  id?: number;
  team_id?: number;
  player_id?: number;
  player_name?: string;
  jersey_number?: number;
  position_id?: number;
  formation_field?: string | null;
  formation_position?: number | null;
  type_id?: number;
  player?: { id?: number; display_name?: string; name?: string; image_path?: string };
}

export interface SmBall {
  id?: number;
  fixture_id?: number;
  period_id?: number;
  timer?: string;
  x?: string | number;
  y?: string | number;
}

// ───────────────────────────── Catalogues de types ──────────────────────────
// Confirmés par https://docs.sportmonks.com/v3/definitions/types/events.md et
// .../statistics.md. La documentation recommande de les résoudre par l'endpoint
// `/core/types` plutôt que de les coder en dur ; on garde donc ces valeurs
// comme REPLI, et l'adaptateur les rafraîchit quand il le peut.

export const TYPE_EVENEMENT = {
  VAR: 10,
  BUT: 14,
  CSC: 15,
  PENALTY: 16,
  PENALTY_MANQUE: 17,
  REMPLACEMENT: 18,
  JAUNE: 19,
  ROUGE: 20,
  JAUNE_ROUGE: 21,
} as const;

export const TYPE_STAT = {
  TIRS: 42,
  TIRS_CADRES: 86,
  TIRS_NON_CADRES: 41,
  CORNERS: 34,
  POSSESSION: 45,
  FAUTES: 56,
  HORS_JEU: 51,
  PASSES: 80,
  PASSES_REUSSIES: 81,
  PASSES_PRECISES: 116,
} as const;
