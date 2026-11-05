/**
 * Le pressure index : qui pousse, en ce moment.
 *
 * Lit `state.pressure`, calculé par le réducteur comme une somme décroissante
 * des temps forts. Rien n'est calculé ici.
 */

import { h, setScaleX, setText } from '../dom.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const momentum: WidgetFactory = (): Widget => {
  const homeLabel = h('span', {}, ['—']);
  const awayLabel = h('span', {}, ['—']);
  const fill = h('i', { class: 'momentum__fill' });

  const el = h('div', { class: 'momentum' }, [
    homeLabel,
    h('div', { class: 'momentum__track' }, [fill]),
    awayLabel,
  ]);

  return {
    el,
    update({ state }: WidgetContext) {
      setText(homeLabel, state.meta?.home.abbr ?? '—');
      setText(awayLabel, state.meta?.away.abbr ?? '—');
      const total = state.pressure.home + state.pressure.away;
      setScaleX(fill, total < 0.01 ? 0.5 : state.pressure.home / total);
    },
  };
};
