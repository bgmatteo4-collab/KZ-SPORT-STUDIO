/**
 * L'avant-match.
 *
 * Avant le coup d'envoi, le score ne dit rien et le chrono ne tourne pas : ce
 * qu'on veut voir, c'est l'affiche. Les deux écus en grand, l'heure du coup
 * d'envoi, la compétition, le stade — et les probabilités déduites des cotes,
 * qui remplacent utilement des statistiques qui n'existent pas encore.
 */

import type { Odds } from '@kz/core';
import { h, setScaleX, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const prematch: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'clock', kicker: 'Coup d’envoi', title: 'Avant-match' });
  const kickoff = h('span', { class: 'odds__badge' }, ['--:--']);
  box.el.querySelector('.panel__aside')?.append(kickoff);

  const crestHome = crestEl('pm__crest');
  const crestAway = crestEl('pm__crest');
  const nameHome = h('div', { class: 'pm__team' }, ['—']);
  const nameAway = h('div', { class: 'pm__team' }, ['—']);

  const affiche = h('div', { class: 'pm__affiche' }, [
    h('div', { class: 'pm__side' }, [crestHome, nameHome]),
    h('div', { class: 'pm__vs' }, ['contre']),
    h('div', { class: 'pm__side' }, [crestAway, nameAway]),
  ]);

  const fillHome = h('i', { class: 'pm__fill pm__fill--home' });
  const fillDraw = h('i', { class: 'pm__fill pm__fill--draw' });
  const fillAway = h('i', { class: 'pm__fill pm__fill--away' });
  const pctHome = h('span', {}, ['—']);
  const pctDraw = h('span', {}, ['—']);
  const pctAway = h('span', {}, ['—']);

  const odds = h('div', { class: 'pm__odds' }, [
    h('div', { class: 't-caption' }, ['Probabilités']),
    h('div', { class: 'pm__bar' }, [fillHome, fillDraw, fillAway]),
    h('div', { class: 'pm__legend' }, [pctHome, pctDraw, pctAway]),
  ]);

  const venue = fact('Stade');
  const round = fact('Compétition');

  box.body.append(h('div', { class: 'pm' }, [affiche, odds, venue.el, round.el]));

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      const meta = state.meta;
      paintCrest(crestHome, meta?.home);
      paintCrest(crestAway, meta?.away);
      setText(nameHome, meta?.home.short.toUpperCase() ?? '—');
      setText(nameAway, meta?.away.short.toUpperCase() ?? '—');
      setText(venue.value, meta?.venue ?? '—');
      setText(round.value, meta?.round ?? meta?.competition ?? '—');
      setText(
        kickoff,
        meta
          ? new Date(meta.kickoff).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : '--:--',
      );

      // Une cote se lit mal ; une probabilité se lit tout de suite.
      const p = probabilities(state.odds);
      setScaleX(fillHome, p ? p[0] : 0.34);
      setScaleX(fillDraw, p ? p[1] : 0.33);
      setScaleX(fillAway, p ? p[2] : 0.33);
      setText(pctHome, p ? `${Math.round(p[0] * 100)} %` : '—');
      setText(pctDraw, p ? `${Math.round(p[1] * 100)} %` : '—');
      setText(pctAway, p ? `${Math.round(p[2] * 100)} %` : '—');
    },
  };
};

function fact(label: string): { el: HTMLElement; value: HTMLElement } {
  const value = h('span', { class: 'pm__fact-value' }, ['—']);
  return {
    el: h('div', { class: 'pm__fact' }, [h('span', { class: 't-caption' }, [label]), value]),
    value,
  };
}

/** Cotes décimales → probabilités, normalisées pour retirer la marge. */
function probabilities(odds: Odds | null): [number, number, number] | null {
  if (!odds || odds.home <= 1 || odds.draw <= 1 || odds.away <= 1) return null;
  const raw = [1 / odds.home, 1 / odds.draw, 1 / odds.away];
  const total = raw[0]! + raw[1]! + raw[2]!;
  return [raw[0]! / total, raw[1]! / total, raw[2]! / total];
}
