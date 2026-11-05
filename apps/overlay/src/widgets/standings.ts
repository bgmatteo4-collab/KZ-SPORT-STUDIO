/** Le classement. Pastille de rang colorée par zone de qualification. */

import { h } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const standings: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'table', kicker: 'Championnat', title: 'Classement' });
  const table = h('div', { class: 'table' }, [
    h('div', { class: 'table__head' }, [
      h('span', {}, ['#']),
      h('span', {}, ['']),
      h('span', {}, ['Équipe']),
      h('span', { class: 'table__num' }, ['Diff']),
      h('span', { class: 'table__num' }, ['Pts']),
    ]),
  ]);
  box.body.append(table);

  let signature = '';

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      const next = state.standings.map((r) => `${r.rank}:${r.points}`).join('|');
      if (next === signature) return;
      signature = next;

      while (table.children.length > 1) table.lastElementChild!.remove();

      for (const row of state.standings) {
        const crest = crestEl('table__crest');
        paintCrest(crest, row.team);
        const rank = h('span', { class: 'table__rank' }, [String(row.rank)]);
        if (row.zone) rank.dataset.zone = row.zone;
        table.append(
          h('div', { class: 'table__row' }, [
            rank,
            crest,
            h('span', { class: 'table__name' }, [row.team.short]),
            h('span', { class: 'table__num' }, [row.diff > 0 ? `+${row.diff}` : String(row.diff)]),
            h('span', { class: 'table__num table__num--pts' }, [String(row.points)]),
          ]),
        );
      }
    },
  };
};
