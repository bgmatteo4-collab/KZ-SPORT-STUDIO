/**
 * Le registre des widgets. Règle n°3 : un widget = une entrée ici.
 *
 * Les entrées `stub` sont déclarées mais pas encore écrites. Elles n'affichent
 * rien et ne cassent rien — ce qui permet de poser tout le catalogue de scènes
 * dès maintenant et de remplir les cases phase par phase.
 */

import { h } from '../dom.js';
import { backdrop, camFrame, feedFrame, scoreRecap, social, streamCounters, title } from './chrome.js';
import { flash } from './flash.js';
import { lineups } from './lineups.js';
import { multiplex } from './multiplex.js';
import { odds } from './odds.js';
import { prematch } from './prematch.js';
import { radar2d } from './radar2d.js';
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
  'feed-frame': feedFrame,
  'stream-counters': streamCounters,
  social,
  title,
  'score-recap': scoreRecap,
  flash,

  // Les panneaux
  stats,
  lineups,
  multiplex,
  standings,
  odds,
  prematch,
  radar2d,

  // À écrire
  radar3d: stub('radar3d'),
  ratings: stub('ratings'),
  sheet: stub('sheet'),
  poll: stub('poll'),
};

export type { Widget, WidgetContext, WidgetFactory } from './types.js';
