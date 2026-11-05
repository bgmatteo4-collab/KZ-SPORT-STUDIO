/**
 * Les pièces d'habillage : fond, titre, récapitulatif, cadre caméra, compteurs
 * de direct, pseudo social.
 */

import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const NS = 'http://www.w3.org/2000/svg';

/** Le fond habillé. Jamais transparent sur une scène de plateau. */
export const backdrop: WidgetFactory = (): Widget => ({
  el: h('div', { class: 'backdrop' }, [
    h('div', { class: 'backdrop__pattern' }),
    h('div', { class: 'backdrop__arc' }),
  ]),
  update() {
    /* décor pur : il vit entièrement dans les jetons du thème */
  },
});

export const title: WidgetFactory = (): Widget => {
  const kicker = h('div', { class: 'title__kicker' }, ['KZ TV']);
  const text = h('div', { class: 'title__text' }, ['']);
  return {
    el: h('div', { class: 'title' }, [kicker, text]),
    update({ opts, state }: WidgetContext) {
      setText(text, typeof opts.text === 'string' ? opts.text : '');
      setText(kicker, state.meta?.competition ?? 'KZ TV');
    },
  };
};

export const scoreRecap: WidgetFactory = (): Widget => {
  const score = h('div', { class: 'recap__score' }, ['']);
  const scorers = h('div', { class: 'recap__scorers' }, ['']);
  return {
    el: h('div', { class: 'recap' }, [score, scorers]),
    update({ state }: WidgetContext) {
      if (!state.meta) {
        setText(score, '');
        setText(scorers, '');
        return;
      }
      setText(
        score,
        `${state.meta.home.short} ${state.score[0]} – ${state.score[1]} ${state.meta.away.short}`,
      );
      setText(
        scorers,
        state.goals.map((g) => `${g.scorer?.short ?? 'csc'} ${g.minute}'`).join('   ·   '),
      );
    },
  };
};

/**
 * Le cadre de la caméra. Il ne dessine QUE le cadre : l'image vient d'OBS en
 * mode `obs`, ou de la couche de fond en mode `browser`.
 */
export const camFrame: WidgetFactory = (): Widget => {
  const el = h('div', { class: 'cam-frame', 'data-style': 'framed' });
  return {
    el,
    update({ cam }: WidgetContext) {
      setAttr(el, 'data-style', cam?.style ?? 'framed');
      el.style.opacity = cam ? '1' : '0';
    },
  };
};

function icon(paths: string[]): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const d of paths) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Vues et likes. Un détail, mais c'est ce qui fait « vrai live ». */
export const streamCounters: WidgetFactory = (): Widget => {
  const viewers = h('span', {}, ['—']);
  const likes = h('span', {}, ['—']);

  const eye = h('div', { class: 'counter' });
  eye.append(icon(['M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z']), viewers);

  const thumb = h('div', { class: 'counter' });
  thumb.append(icon(['M7 10v11H3V10z', 'M7 10l4-7a2 2 0 0 1 3 2l-1 5h5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 16.6 21H7']), likes);

  return {
    el: h('div', { class: 'counters' }, [eye, thumb]),
    update({ state }: WidgetContext) {
      setText(viewers, state.audience ? compact(state.audience.viewers) : '—');
      setText(likes, state.audience ? compact(state.audience.likes) : '—');
    },
  };
};

export const social: WidgetFactory = (): Widget => {
  const handle = h('span', {}, ['KZ TV']);
  const el = h('div', { class: 'social' });
  const mark = document.createElementNS(NS, 'svg');
  mark.setAttribute('viewBox', '0 0 24 24');
  const note = document.createElementNS(NS, 'path');
  note.setAttribute(
    'd',
    'M9 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm3-3V3h3a5 5 0 0 0 5 5v3a8 8 0 0 1-5-1.8V15z',
  );
  mark.append(note);
  el.append(mark, handle);

  return {
    el,
    update({ opts }: WidgetContext) {
      setText(handle, typeof opts.handle === 'string' ? opts.handle : 'KZ TV');
    },
  };
};

/** 24 197 → « 24,2 k ». Un compteur d'antenne ne montre pas six chiffres. */
function compact(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1).replace('.', ',')} k`;
  return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`;
}

export { crestEl, paintCrest };
