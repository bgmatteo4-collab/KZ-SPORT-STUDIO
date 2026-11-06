/**
 * Le protocole entre le serveur et les pages.
 *
 * Deux principes :
 *   • Le serveur fait autorité (règle n°1). L'overlay n'envoie que des intentions.
 *   • Tout message d'état porte des `seq`, donc une coupure réseau se répare
 *     par `resume` sans tout retélécharger.
 */
export const DEFAULT_CONTROL = {
    delayMs: 30_000,
    sceneId: 'match',
    themeId: 'kztv',
    camMode: 'browser',
    live: false,
    insertMode: 'auto',
    insertForce: null,
    timeScale: 1,
};
