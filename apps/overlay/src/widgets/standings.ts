/**
 * Le classement.
 *
 * Mise en page d'antenne, relevée sur le produit de référence : chaque ligne
 * est une PILULE continue, avec le bloc de rang soudé à son extrémité gauche
 * — coloré par zone de qualification — et le total de points soudé à droite.
 * Entre les deux, l'écu, le nom en capitales, puis les matchs joués et la
 * différence de buts en petit.
 *
 * `opts.large` passe à deux colonnes : un classement de vingt lignes sur une
 * seule colonne demande une hauteur qu'aucune scène n'a.
 */

import type { StandingRow } from '@kz/core';
import { h } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const standings: WidgetFactory = (ctx): Widget => {
  const large = ctx.opts.large === true;
  const box = panel({ icon: 'table', kicker: 'Championnat', title: 'Classement' });

  const grid = h('div', { class: large ? 'table table--two' : 'table' });
  box.body.append(grid);

  let signature: string | null = null;

  /** Hauteur d'une ligne, gouttière comprise. */
  const ROW = 54;
  /** Ce que mangent l'en-tête du panneau et la ligne de titres. */
  const CHROME = 76 + 34 + 24;

  return {
    el: box.el,
    update({ state, box: slot }: WidgetContext) {
      // Vingt lignes ne tiennent pas dans une colonne de cinq cents pixels. On
      // montre ce qui tient, plutôt que de laisser le cadre couper une ligne
      // en deux — à l'antenne, une ligne tranchée se voit bien plus qu'une
      // ligne absente.
      const perColumn =
        slot.h > 0 ? Math.max(3, Math.floor((slot.h - CHROME) / ROW)) : state.standings.length;
      const capacity = large ? perColumn * 2 : perColumn;
      const shown = state.standings.slice(0, Math.min(capacity, state.standings.length));

      const next = `${shown.length}|${shown.map((r) => `${r.rank}:${r.points}:${r.diff}`).join('|')}`;
      if (next === signature) return;
      signature = next;

      grid.replaceChildren();
      if (shown.length === 0) return;

      // En grand : deux colonnes égales, la première moitié puis la seconde.
      const columns = large
        ? [shown.slice(0, Math.ceil(shown.length / 2)), shown.slice(Math.ceil(shown.length / 2))]
        : [shown];

      for (const rows of columns) {
        if (rows.length === 0) continue;
        const column = h('div', { class: 'table__col' }, [header()]);
        for (const row of rows) column.append(buildRow(row));
        grid.append(column);
      }
    },
  };
};

function header(): HTMLElement {
  return h('div', { class: 'table__head t-caption' }, [
    h('span', {}, ['#']),
    h('span', {}, ['']),
    h('span', {}, ['Équipe']),
    h('span', { class: 'table__num' }, ['J']),
    h('span', { class: 'table__num' }, ['Diff']),
    h('span', { class: 'table__num' }, ['Pts']),
  ]);
}

function buildRow(row: StandingRow): HTMLElement {
  const crest = crestEl('table__crest');
  paintCrest(crest, row.team);

  const rank = h('span', { class: 'table__rank' }, [String(row.rank)]);
  if (row.zone) rank.dataset.zone = row.zone;

  return h('div', { class: 'table__row' }, [
    rank,
    crest,
    h('span', { class: 'table__name' }, [row.team.short.toUpperCase()]),
    h('span', { class: 'table__num' }, [String(row.played)]),
    h('span', { class: 'table__num' }, [row.diff > 0 ? `+${row.diff}` : String(row.diff)]),
    h('span', { class: 'table__pts' }, [String(row.points)]),
  ]);
}
