export * from './env.js';
export * from './provider.js';
export * from './simulator.js';
export * from './sportmonks/index.js';

// Les deux adaptateurs nomment leurs fonctions pareil — `traduire`,
// `nouvelEtat`, `capturerUneFois` — parce que c'est le bon nom des deux côtés.
// On expose donc ESPN sous son propre espace plutôt que de tordre les noms.
export * as espn from './espn/index.js';
export { EspnProvider, matchsEnCours, type EspnOptions } from './espn/index.js';
