/**
 * La forme RÉELLE des réponses ESPN.
 *
 * ── Pourquoi ce fichier n'est pas écrit d'après une documentation ────────────
 *
 * Il n'y en a pas. L'API d'ESPN n'est pas documentée : elle alimente leur site
 * et leurs applications, et elle est publique sans jeton. Tout ce qui suit a
 * donc été relevé sur de vraies réponses — une soirée de Ligue des Champions
 * (9 matchs) et le résumé complet d'une rencontre. Les champs sont tous
 * optionnels, parce qu'une API non contractuelle peut en retirer un sans
 * prévenir et que notre règle est « pas de donnée, pas d'événement, jamais
 * d'erreur ».
 *
 * ── Les deux points d'entrée ────────────────────────────────────────────────
 *
 *   /scoreboard              toute la soirée. Léger (~15 Ko pour un
 *                            championnat). Donne score, horloge, période,
 *                            état, et les faits marquants bruts.
 *   /summary?event=<id>      une rencontre. Lourd (~475 Ko). Donne les
 *                            statistiques, les compositions, les faits
 *                            détaillés avec noms de joueurs, le classement,
 *                            les cotes et le fil du match.
 *
 * On interroge le premier souvent et le second plus rarement : voir la note
 * sur les cadences dans `index.ts`.
 *
 * ── Ce qu'ESPN ne donne PAS ─────────────────────────────────────────────────
 *
 * Aucune position de ballon, et aucun `xG`. Le radar et la colonne `xg` de nos
 * statistiques restent donc sans source. On ne les invente pas : la traduction
 * les laisse vides et l'inscrit dans ses lacunes.
 */
// ───────────────────────────── Nos propres repères ───────────────────────────
/**
 * Les identifiants de championnat chez ESPN, pour ceux qui nous concernent.
 *
 * La liste est bien plus longue ; on ne garde que ce que KZ TV commente, plus
 * de quoi tester. Le nom qui suit est notre identifiant d'habillage, ce qui
 * fait que choisir une ligue choisit aussi le thème.
 */
export const LIGUES = {
    'uefa.champions': { nom: 'Ligue des Champions', theme: 'ucl' },
    'uefa.europa': { nom: 'Ligue Europa', theme: 'ucl' },
    'uefa.europa.conf': { nom: 'Ligue Conférence', theme: 'ucl' },
    'fra.1': { nom: 'Ligue 1', theme: 'ligue1' },
    'eng.1': { nom: 'Premier League', theme: 'premier' },
    'esp.1': { nom: 'Liga', theme: 'kztv' },
    'ita.1': { nom: 'Serie A', theme: 'kztv' },
    'ger.1': { nom: 'Bundesliga', theme: 'kztv' },
    'fra.coupe_de_france': { nom: 'Coupe de France', theme: 'ligue1' },
};
/**
 * Le maillot, déduit du nom du club.
 *
 * ESPN ne dit pas si une équipe joue rayé. Rayer tout le monde est faux et se
 * voit ; ne rayer personne est faux aussi, mais discrètement. On traite donc à
 * la main la poignée de clubs dont la rayure est l'identité même, et le reste
 * reste uni. C'est une heuristique assumée, pas une donnée.
 */
export function maillotDeviné(nom) {
    const n = nom.toLowerCase();
    if (/barcelona|atlético|atletico|athletic club|crystal palace|sunderland|newcastle|juventus|inter |internazionale|milan|brighton|qpr|queens park/.test(n)) {
        return 'striped';
    }
    if (/celtic|sporting|hoops/.test(n))
        return 'hoops';
    return undefined;
}
