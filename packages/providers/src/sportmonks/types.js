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
};
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
};
