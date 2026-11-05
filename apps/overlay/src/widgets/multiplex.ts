/**
 * Le multiplex : les autres matchs en cours.
 *
 * C'est le panneau le plus regardé d'un watchalong — les gens veulent savoir
 * ce qui se passe ailleurs sans quitter le direct.
 *
 * Mise en page relevée sur le produit de référence : la minute vit DANS LA
 * MARGE, en petit et en rouge, sans pastille — une pastille pleine attire
 * l'œil plus que le score, qui est l'information. Le score, lui, est grand et
 * aligné dans sa propre colonne à droite.
 */

import { h, setAttr } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const multiplex: WidgetFactory = (ctx): Widget => {
  const large = ctx.opts.large === true;
  const box = panel({ icon: 'live', kicker: 'En direct', title: 'Matchs' });

  // La pastille de direct, à droite de l'en-tête.
  const live = h('i', { class: 'mx__live' });
  box.el.querySelector('.panel__aside')?.append(live);

  const list = h('div', { class: large ? 'multiplex multiplex--two' : 'multiplex' });
  box.body.append(list);

  let signature: string | null = null;

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      setAttr(live, 'data-on', state.otherMatches.some((m) => m.live) ? '1' : '0');

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
              h('span', { class: 'mx__name' }, [team.short.toUpperCase()]),
              h('span', { class: 'mx__goals' }, [String(goals)]),
            ]),
          );
        }
        const minute = h('div', { class: 'mx__minute' }, [match.minute]);
        if (!match.live) minute.dataset.off = '1';
        list.append(h('div', { class: 'mx' }, [minute, rows]));
      }
    },
  };
};
