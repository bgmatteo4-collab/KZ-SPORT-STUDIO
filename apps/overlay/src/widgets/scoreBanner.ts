/**
 * La bannière de score : la pièce maîtresse du plateau.
 *
 * Structure observée sur le produit de référence :
 *   écu | NOM  [chiffre][chiffre]  NOM | écu        ← les écus sont HORS du bandeau
 *        buteurs · CHRONO · buteurs                  ← chrono souligné d'or
 */

import { clockLabel, PHASE_LABEL } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const scoreBanner: WidgetFactory = (): Widget => {
  const crestHome = crestEl('banner__crest');
  const crestAway = crestEl('banner__crest');
  const nameHome = h('div', { class: 'banner__team banner__team--home' }, ['—']);
  const nameAway = h('div', { class: 'banner__team banner__team--away' }, ['—']);
  const digitHome = h('div', { class: 'banner__digit' }, ['0']);
  const digitAway = h('div', { class: 'banner__digit' }, ['0']);

  const scorersHome = h('div', { class: 'banner__scorers banner__scorers--home' });
  const scorersAway = h('div', { class: 'banner__scorers' });
  const clockMain = h('span', {}, ['0:00']);
  const clockAdded = h('span', { class: 'banner__added' });
  const liveDot = h('div', { class: 'banner__live', 'data-on': '0' }, [
    h('i'),
    h('span', {}, ['Direct']),
  ]);

  const el = h('div', { class: 'banner' }, [
    h('div', { class: 'banner__main' }, [
      crestHome,
      h('div', { class: 'banner__plate' }, [
        nameHome,
        h('div', { class: 'banner__score' }, [digitHome, digitAway]),
        nameAway,
      ]),
      crestAway,
    ]),
    h('div', { class: 'banner__strip' }, [
      scorersHome,
      h('div', { class: 'banner__clock' }, [clockMain, clockAdded]),
      scorersAway,
    ]),
    liveDot,
  ]);

  let lastGoalSeq = -1;

  return {
    el,
    update({ state, clockMs }: WidgetContext) {
      const meta = state.meta;
      paintCrest(crestHome, meta?.home);
      paintCrest(crestAway, meta?.away);
      setText(nameHome, meta?.home.short.toUpperCase() ?? '—');
      setText(nameAway, meta?.away.short.toUpperCase() ?? '—');
      setText(digitHome, String(state.score[0]));
      setText(digitAway, String(state.score[1]));

      const label = clockLabel(clockMs, state.phase, state.clock.addedMinutes);
      // Hors jeu courant, le chrono cède la place au nom de la période.
      const running = state.phase === 'first_half' || state.phase === 'second_half' ||
        state.phase === 'extra_first' || state.phase === 'extra_second';
      setText(clockMain, running ? label.main : PHASE_LABEL[state.phase].toUpperCase());
      setText(clockAdded, running ? (label.added ?? '') : '');

      setAttr(liveDot, 'data-on', state.phase !== 'pre' && state.phase !== 'full_time' ? '1' : '0');

      // Les buteurs ne bougent qu'au but : inutile de reconstruire 60 fois par seconde.
      const latest = state.goals.length === 0 ? -1 : state.goals[state.goals.length - 1]!.seq;
      if (latest !== lastGoalSeq) {
        lastGoalSeq = latest;
        fillScorers(scorersHome, state, 'home');
        fillScorers(scorersAway, state, 'away');
      }
    },
  };
};

function fillScorers(host: HTMLElement, state: WidgetContext['state'], side: 'home' | 'away'): void {
  host.replaceChildren();
  for (const goal of state.goals.filter((g) => g.side === side)) {
    const name = goal.ownGoal ? 'csc' : (goal.scorer?.short ?? 'But');
    const suffix = goal.penalty ? ' (sp)' : goal.ownGoal ? ' (csc)' : '';
    host.append(
      h('span', {}, [h('b', {}, [name.toUpperCase()]), ` ${goal.minute}'${suffix}`]),
    );
  }
}
