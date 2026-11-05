/**
 * Le châssis d'un panneau : l'en-tête à deux niveaux qui fait la signature de
 * l'habillage, et un corps que le widget remplit.
 *
 *     ▣  En direct          ← surtitre, gris bleuté
 *        MATCHS             ← titre, blanc, capitales
 */

import { h, setText } from '../dom.js';
import { crestEl, paintCrest, type AnyTeam } from './crest.js';

const NS = 'http://www.w3.org/2000/svg';

export type IconName = 'stats' | 'lineup' | 'table' | 'odds' | 'live' | 'clock' | 'radar';

const PATHS: Record<IconName, string[]> = {
  stats: ['M3 6h12', 'M3 12h8', 'M3 18h15'],
  lineup: ['M4 12h16', 'M12 4v16'],
  table: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M21 19H3'],
  odds: ['M4 8h16v8H4z', 'M9 8v8', 'M15 8v8'],
  live: ['M12 2v4', 'M12 18v4', 'M4.9 4.9l2.8 2.8', 'M16.3 16.3l2.8 2.8', 'M2 12h4', 'M18 12h4'],
  clock: ['M12 7v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  radar: ['M12 12l6-4', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 12v9'],
};

function icon(name: IconName): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const d of PATHS[name]) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export interface Panel {
  el: HTMLElement;
  body: HTMLElement;
  /** Met à jour les deux lignes de l'en-tête. */
  setHead(kicker: string, title: string): void;
  /** Les écus alignés à droite de l'en-tête. */
  setCrests(teams: (AnyTeam | undefined)[]): void;
}

export function panel(options: {
  icon: IconName;
  kicker: string;
  title: string;
  crests?: number;
}): Panel {
  const kickerEl = h('div', { class: 'panel__kicker t-kicker' }, [options.kicker]);
  const titleEl = h('div', { class: 'panel__title t-title' }, [options.title]);
  const aside = h('div', { class: 'panel__aside' });

  const crests: HTMLElement[] = [];
  for (let i = 0; i < (options.crests ?? 0); i += 1) {
    const c = crestEl('mx__crest');
    crests.push(c);
    aside.append(c);
  }

  const iconBox = h('div', { class: 'panel__icon' });
  iconBox.append(icon(options.icon));

  const body = h('div', { class: 'panel__body' });
  const el = h('div', { class: 'panel' }, [
    h('div', { class: 'panel__head' }, [
      iconBox,
      h('div', { class: 'panel__titles' }, [kickerEl, titleEl]),
      aside,
    ]),
    body,
  ]);

  return {
    el,
    body,
    setHead(kicker, title) {
      setText(kickerEl, kicker);
      setText(titleEl, title);
    },
    setCrests(teams) {
      crests.forEach((node, i) => paintCrest(node, teams[i]));
    },
  };
}
