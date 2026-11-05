/**
 * Le multiplex : les autres matchs en cours, dans la colonne de gauche.
 *
 * C'est le panneau le plus regardé d'un watchalong — les gens veulent savoir
 * ce qui se passe ailleurs sans quitter le direct.
 */

import { h } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const multiplex: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'live', kicker: 'En direct', title: 'Matchs' });
  const list = h('div', { class: 'multiplex' });
  box.body.append(list);

  // `null` et non `''` : une liste vide produit la signature `''`, donc une
  // sentinelle vide empêcherait le widget de dessiner son état vide.
  let signature: string | null = null;

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      const matches = state.otherMatches;
      const next = matches.map((m) => `${m.id}:${m.score[0]}-${m.score[1]}:${m.minute}`).join('|');
      if (next === signature) return;
      signature = next;

      list.replaceChildren();
      for (const match of matches) {
        const rows = h('div', { class: 'mx__rows' });
        for (const [team, goals] of [
          [match.home, match.score[0]],
          [match.away, match.score[1]],
        ] as const) {
          const crest = crestEl('mx__crest');
          paintCrest(crest, team);
          rows.append(
            h('div', { class: 'mx__row' }, [
              crest,
              h('span', { class: 'mx__name' }, [team.short]),
              h('span', { class: 'mx__goals' }, [String(goals)]),
            ]),
          );
        }
        list.append(
          h('div', { class: 'mx' }, [
            h('div', { class: 'mx__minute' }, [match.minute]),
            rows,
          ]),
        );
      }
    },
  };
};
