/**
 * Le registre des widgets. Règle n°3 : un widget = une entrée ici.
 *
 * Les entrées `stub` sont déclarées mais pas encore écrites. Elles n'affichent
 * rien et ne cassent rien — ce qui permet de poser tout le catalogue de scènes
 * dès maintenant et de remplir les cases phase par phase.
 */

import { h } from '../dom.js';
import { attente } from './attente.js';
import { backdrop, camFrame, scoreRecap, social, streamCounters, title } from './chrome.js';
import { fil } from './fil.js';
import { flash } from './flash.js';
import { lineups } from './lineups.js';
import { momentum } from './momentum.js';
import { multiplex } from './multiplex.js';
import { odds } from './odds.js';
import { prematch } from './prematch.js';
import { radar2d } from './radar2d.js';
import { reseaux } from './reseaux.js';
import { sheet } from './sheet.js';
import { shotmap } from './shotmap.js';
import { scoreBanner } from './scoreBanner.js';
import { standings } from './standings.js';
import { stats } from './stats.js';
import type { Widget, WidgetFactory } from './types.js';

/** Déclaré, pas encore écrit. Ne dessine rien. */
const stub = (name: string): WidgetFactory => (): Widget => ({
  el: h('div', { class: 'stub', 'data-widget': name }),
  update() {
    /* phase ultérieure */
  },
});

export const REGISTRY: Record<string, WidgetFactory> = {
  // Le plateau
  backdrop,
  'score-banner': scoreBanner,
  'cam-frame': camFrame,
  'stream-counters': streamCounters,
  // `social` montrait une note de musique et « KZ TV ». Un pictogramme de
  // TikTok sur un plateau de football ne dit rien, et un pseudo seul ne donne
  // aucune raison d'aller quelque part.
  social: reseaux,
  reseaux,
  title,
  'score-recap': scoreRecap,
  flash,

  // Les panneaux
  attente,
  stats,
  fil,
  // Deuxième clé pour le même widget : le bandeau du direct montre les
  // derniers faits tandis que l'insert raconte tout le match. Deux lectures,
  // deux couches, donc deux entrées — le compositeur identifie par la clé.
  'fil-recent': fil,
  lineups,
  // Deuxième entrée pour le même widget : le compositeur identifie une couche
  // par sa clé, donc deux compositions à l'écran demandent deux clés.
  'lineups-away': lineups,
  multiplex,
  momentum,
  standings,
  odds,
  prematch,
  // Plus utilisé par aucune scène : aucune source gratuite ne donne la
  // position du ballon. Gardé enregistré pour le jour où un palier payant la
  // fournit — le widget, lui, est écrit et testé.
  radar2d,
  sheet,
  shotmap,

  // À écrire
  radar3d: stub('radar3d'),
  ratings: stub('ratings'),
  poll: stub('poll'),
};

export type { Widget, WidgetContext, WidgetFactory } from './types.js';
