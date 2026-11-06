/**
 * Le modèle interne du match. Indépendant de tout fournisseur.
 *
 * RÈGLE : un adaptateur traduit vers ce modèle, jamais l'inverse. Si Sportmonks
 * change son format demain, seul l'adaptateur bouge. Rien dans le rendu ne
 * connaît le nom d'un fournisseur.
 */
/** Minute à laquelle chaque période démarre son chrono affiché. */
export const PHASE_CLOCK_START = {
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
export const PHASE_CLOCK_END = {
    first_half: 45 * 60_000,
    second_half: 90 * 60_000,
    extra_first: 105 * 60_000,
    extra_second: 120 * 60_000,
};
export const PHASE_LABEL = {
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
export const EMPTY_STATS = {
    possession: [50, 50],
    shots: [0, 0],
    shotsOnTarget: [0, 0],
    corners: [0, 0],
    fouls: [0, 0],
    offsides: [0, 0],
    xg: [0, 0],
    passes: [0, 0],
    passAccuracy: [0, 0],
    yellowCards: [0, 0],
    redCards: [0, 0],
};
