/**
 * La bannière de score : la pièce maîtresse du plateau.
 *
 * Structure relevée sur le produit de référence — une SEULE bande, et tout
 * vit dedans :
 *
 *   ┌──────────────────────────────────────────────────────────┬──────────┐
 *   │  REAL MADRID  [écu]  0 │ 0  [écu]  MAN CITY              │ LIGUE DES│
 *   └──────────────────────────────────────────────────────────┴──────────┘
 *            buteurs  ·  CHRONO souligné d'or  ·  buteurs
 *
 * Les écus sont DANS le cadre, encadrant le score : trois pièces qui flottent
 * séparément ne font pas un habillage, elles font un montage.
 *
 * Le cartouche de compétition est calé à l'extrémité droite, et une cale
 * invisible de même largeur à gauche garde le score exactement au centre.
 */

import { clockLabel, ecuLocal, PHASE_LABEL } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const scoreBanner: WidgetFactory = (): Widget => {
  const crestHome = crestEl('banner__crest');
  const crestAway = crestEl('banner__crest');
  const nameHome = h('div', { class: 'banner__team banner__team--home t-hero' }, ['—']);
  const nameAway = h('div', { class: 'banner__team banner__team--away t-hero' }, ['—']);
  const digitHome = h('div', { class: 'banner__digit t-score' }, ['0']);
  const digitAway = h('div', { class: 'banner__digit t-score' }, ['0']);

  const compName = h('div', { class: 'banner__comp-name' }, ['']);
  const compRound = h('div', { class: 'banner__comp-round' }, ['']);
  // L'emblème de la compétition, quand le fournisseur en donne l'adresse. Il
  // ne remplace pas le nom : à l'antenne, un logo seul laisse le spectateur
  // qui ne le reconnaît pas sans rien. Il le précède.
  const compLogo = h('img', { class: 'banner__comp-logo', alt: '', decoding: 'async' });
  const compText = h('div', { class: 'banner__comp-text' }, [compName, compRound]);
  const compCap = h('div', { class: 'banner__comp' }, [compLogo, compText]);
  compLogo.addEventListener('load', () => compCap.setAttribute('data-logo', '1'));
  compLogo.addEventListener('error', () => compCap.removeAttribute('data-logo'));
  let embleme = '';

  const scorersHome = h('div', { class: 'banner__scorers banner__scorers--home' });
  const scorersAway = h('div', { class: 'banner__scorers' });
  const clockMain = h('span', {}, ['0:00']);
  const clockAdded = h('span', { class: 'banner__added' });
  const liveDot = h('div', { class: 'banner__live', 'data-on': '0' }, [
    h('i'),
    h('span', { class: 't-caption' }, ['Direct']),
  ]);

  const el = h('div', { class: 'banner' }, [
    h('div', { class: 'banner__plate' }, [
      // La cale : même largeur que le cartouche, pour que le score reste centré.
      h('div', { class: 'banner__shim' }),
      nameHome,
      crestHome,
      h('div', { class: 'banner__score' }, [digitHome, digitAway]),
      crestAway,
      nameAway,
      compCap,
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

      // « Ligue des Champions — Quart de finale » se coupe en deux lignes :
      // la compétition au-dessus, le tour en dessous.
      const [competition, round] = splitCompetition(meta?.competition, meta?.round);
      setText(compName, competition);
      setText(compRound, round);

      const voulu = ecuLocal(meta?.competitionCrest) ?? '';
      if (voulu !== embleme) {
        embleme = voulu;
        compCap.removeAttribute('data-logo');
        if (voulu) compLogo.setAttribute('src', voulu);
        else compLogo.removeAttribute('src');
      }

      const label = clockLabel(clockMs, state.phase, state.clock.addedMinutes);
      const running =
        state.phase === 'first_half' ||
        state.phase === 'second_half' ||
        state.phase === 'extra_first' ||
        state.phase === 'extra_second';
      setText(clockMain, running ? label.main : PHASE_LABEL[state.phase].toUpperCase());
      setText(clockAdded, running ? (label.added ?? '') : '');

      setAttr(liveDot, 'data-on', state.phase !== 'pre' && state.phase !== 'full_time' ? '1' : '0');

      // Les buteurs ne bougent qu'au but : inutile de reconstruire 60 fois/s.
      const latest = state.goals.length === 0 ? -1 : state.goals[state.goals.length - 1]!.seq;
      if (latest !== lastGoalSeq) {
        lastGoalSeq = latest;
        fillScorers(scorersHome, state, 'home');
        fillScorers(scorersAway, state, 'away');
      }
    },
  };
};

function splitCompetition(competition?: string, round?: string): [string, string] {
  if (!competition) return ['', ''];
  const parts = competition.split(/\s+[—–-]\s+/);
  if (parts.length > 1) return [parts[0]!, parts.slice(1).join(' — ')];
  return [competition, round ?? ''];
}

function fillScorers(host: HTMLElement, state: WidgetContext['state'], side: 'home' | 'away'): void {
  host.replaceChildren();
  for (const goal of state.goals.filter((g) => g.side === side)) {
    const name = goal.ownGoal ? 'csc' : (goal.scorer?.short ?? 'But');
    const suffix = goal.penalty ? ' (sp)' : goal.ownGoal ? ' (csc)' : '';
    host.append(h('span', {}, [h('b', {}, [name.toUpperCase()]), ` ${goal.minute}'${suffix}`]));
  }
}
