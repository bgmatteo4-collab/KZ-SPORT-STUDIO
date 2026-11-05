/** Les cotes 1N2. Trois cases : domicile, nul, extérieur. */

import { h, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const odds: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'odds', kicker: 'Bookmaker', title: 'Cotes' });
  box.el.querySelector('.panel__aside')?.append(h('span', { class: 'odds__badge' }, ['1N2']));

  const crestHome = crestEl('odds__crest');
  const crestAway = crestEl('odds__crest');
  const valueHome = h('span', { class: 'odds__value' }, ['—']);
  const valueDraw = h('span', { class: 'odds__value' }, ['—']);
  const valueAway = h('span', { class: 'odds__value' }, ['—']);

  const row = h('div', { class: 'odds' }, [
    h('div', { class: 'odds__cell' }, [crestHome, valueHome]),
    h('div', { class: 'odds__cell' }, [h('span', { class: 'odds__x' }, ['N']), valueDraw]),
    h('div', { class: 'odds__cell' }, [crestAway, valueAway]),
  ]);
  box.body.append(row);

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      paintCrest(crestHome, state.meta?.home);
      paintCrest(crestAway, state.meta?.away);
      // Pas de cotes = des tirets. Jamais « undefined » à l'antenne.
      const o = state.odds;
      setText(valueHome, o ? o.home.toFixed(2) : '—');
      setText(valueDraw, o ? o.draw.toFixed(2) : '—');
      setText(valueAway, o ? o.away.toFixed(2) : '—');
      box.setHead(o?.bookmaker ?? 'Bookmaker', 'Cotes');
    },
  };
};
