/**
 * Les statistiques : un anneau pour la possession, des barres coupées en deux
 * pour le reste. Les valeurs sont incrustées DANS la barre, pas à côté.
 */

import type { MatchState, Pair } from '@kz/core';
import { h, setScaleX, setText } from '../dom.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const NS = 'http://www.w3.org/2000/svg';
const CIRCUMFERENCE = 2 * Math.PI * 46;

interface Row {
  label: string;
  read: (s: MatchState) => Pair;
  format?: (v: number) => string;
}

/** L'essentiel, toujours affiché. */
const ROWS: Row[] = [
  { label: 'Tirs (total)', read: (s) => s.stats.shots },
  { label: 'Tirs cadrés', read: (s) => s.stats.shotsOnTarget },
  { label: 'Corners', read: (s) => s.stats.corners },
  { label: 'xG', read: (s) => s.stats.xg, format: (v) => v.toFixed(2) },
];

/** Le complément, sur les scènes qui ont la place (`opts.large`). */
const ROWS_LARGE: Row[] = [
  { label: 'Passes', read: (s) => s.stats.passes },
  { label: 'Fautes', read: (s) => s.stats.fouls },
  { label: 'Hors-jeu', read: (s) => s.stats.offsides },
  { label: 'Cartons jaunes', read: (s) => s.stats.yellowCards },
];

export const stats: WidgetFactory = (ctx): Widget => {
  const large = ctx.opts.large === true;
  const rows = large ? [...ROWS, ...ROWS_LARGE] : ROWS;
  const box = panel({ icon: 'stats', kicker: 'En direct', title: 'Statistiques', crests: 2 });

  const possHome = h('div', { class: 'ring__value t-xl' }, ['50%']);
  const possAway = h('div', { class: 'ring__value t-xl' }, ['50%']);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 108 108');
  const track = document.createElementNS(NS, 'circle');
  track.setAttribute('cx', '54');
  track.setAttribute('cy', '54');
  track.setAttribute('r', '46');
  track.setAttribute('stroke', 'var(--pill)');
  const arc = document.createElementNS(NS, 'circle');
  arc.setAttribute('cx', '54');
  arc.setAttribute('cy', '54');
  arc.setAttribute('r', '46');
  arc.setAttribute('stroke', 'var(--accent)');
  arc.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
  arc.style.transition = 'stroke-dashoffset var(--dur-base) var(--ease)';
  svg.append(track, arc);

  const dial = h('div', { class: 'ring__dial' }, [svg, h('div', { class: 'ring__label' }, ['Possession'])]);
  const ring = h('div', { class: 'ring' }, [possHome, dial, possAway]);

  const built = rows.map((row) => {
    const home = h('span', { class: 'bar__num t-l' }, ['0']);
    const away = h('span', { class: 'bar__num bar__num--away t-l' }, ['0']);
    const fill = h('i', { class: 'bar__fill' });
    const node = h('div', { class: 'bar' }, [
      h('span', { class: 'bar__label t-label' }, [row.label]),
      h('div', { class: 'bar__track' }, [fill, home, away]),
    ]);
    return { row, home, away, fill, node };
  });

  const barsBox = h('div', { class: 'bars' }, built.map((b) => b.node));
  // En grand, deux colonnes : huit barres l'une sous l'autre font liste de
  // courses, pas feuille de statistiques.
  if (large) barsBox.classList.add('bars--two');
  const wrap = h('div', { class: large ? 'stats stats--large' : 'stats' }, [ring, barsBox]);
  box.body.append(wrap);

  /** Hauteur en dessous de laquelle l'anneau et les barres doivent maigrir. */
  const DENSE_UNDER = 560;

  return {
    el: box.el,
    update({ state, box: slot }: WidgetContext) {
      // Le widget connaît la taille de son créneau : il s'y adapte plutôt que
      // de déborder. C'est au contenu de céder, jamais au cadre.
      const dense = slot.h > 0 && slot.h < DENSE_UNDER ? '1' : '0';
      if (wrap.dataset.dense !== dense) wrap.dataset.dense = dense;

      box.setCrests([state.meta?.home, state.meta?.away]);

      const [ph, pa] = state.stats.possession;
      setText(possHome, `${Math.round(ph)}%`);
      setText(possAway, `${Math.round(pa)}%`);
      const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, ph / 100)));
      const next = String(offset.toFixed(1));
      if (arc.getAttribute('stroke-dashoffset') !== next) {
        arc.setAttribute('stroke-dashoffset', next);
      }

      for (const { row, home, away, fill } of built) {
        const [a, b] = row.read(state);
        const format = row.format ?? ((v: number) => String(Math.round(v)));
        setText(home, format(a));
        setText(away, format(b));
        setScaleX(fill, a + b === 0 ? 0.5 : a / (a + b));
      }
    },
  };
};
