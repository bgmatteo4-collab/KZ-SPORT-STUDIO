/** L'avant-match : l'affiche, l'heure, le lieu. */

import { h, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const prematch: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'clock', kicker: 'Coup d’envoi', title: 'Avant-match' });
  const kickoff = h('span', { class: 'odds__badge' }, ['--:--']);
  box.el.querySelector('.panel__aside')?.append(kickoff);

  const crestHome = crestEl('banner__mini');
  const crestAway = crestEl('banner__mini');
  const versus = h('div', { class: 'ring' }, [
    crestHome,
    h('div', { class: 'ring__label' }, ['contre']),
    crestAway,
  ]);

  const venue = h('span', { class: 'mx__name' }, ['—']);
  const round = h('span', { class: 'mx__name' }, ['—']);

  box.body.append(
    h('div', { class: 'stats' }, [
      versus,
      h('div', { class: 'multiplex' }, [
        h('div', { class: 'mx' }, [h('div', { class: 'mx__rows' }, [venue])]),
        h('div', { class: 'mx' }, [h('div', { class: 'mx__rows' }, [round])]),
      ]),
    ]),
  );

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      paintCrest(crestHome, state.meta?.home);
      paintCrest(crestAway, state.meta?.away);
      setText(venue, state.meta?.venue ?? '—');
      setText(round, state.meta?.round ?? state.meta?.competition ?? '—');
      setText(
        kickoff,
        state.meta
          ? new Date(state.meta.kickoff).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '--:--',
      );
    },
  };
};
