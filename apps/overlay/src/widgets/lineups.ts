/**
 * Les compositions.
 *
 * Affiche ce que le modèle porte déjà et que je laissais dormir : la formation,
 * l'entraîneur, les numéros, et les remplaçants. Un panneau de compositions qui
 * ne montre que onze noms est à moitié fait.
 *
 * `opts.side` choisit l'équipe ; `opts.large` ajoute le banc. Une scène plein
 * écran pose donc deux fois ce widget, un par équipe.
 */

import type { CardKind, MatchState, Player, Side } from '@kz/core';
import { h, setText } from '../dom.js';
import { jerseyEl } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/** « 4-3-3 » → les rangées, du gardien vers l'attaque. */
function parseFormation(formation: string): number[] {
  const rows = formation
    .split('-')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return rows.length === 0 ? [4, 3, 3] : rows;
}

/** Place chaque titulaire en coordonnées normalisées du terrain. */
function positions(formation: string, count: number): { x: number; y: number }[] {
  const rows = parseFormation(formation);
  const out: { x: number; y: number }[] = [{ x: 0.5, y: 0.88 }]; // le gardien

  const top = 0.06;
  const bottom = 0.7;
  rows.forEach((n, rowIndex) => {
    const y = bottom - ((bottom - top) * rowIndex) / Math.max(1, rows.length - 1);
    for (let i = 0; i < n; i += 1) {
      // Les rangées paires sont légèrement décalées : un alignement parfait
      // sur trois rangs fait grille de tableur, pas composition de football.
      const spread = (i + 1) / (n + 1);
      out.push({ x: spread, y });
    }
  });

  return out.slice(0, count);
}

export const lineups: WidgetFactory = (ctx): Widget => {
  const side: Side = ctx.opts.side === 'away' ? 'away' : 'home';
  const large = ctx.opts.large === true;

  const box = panel({
    icon: 'lineup',
    kicker: side === 'home' ? 'Domicile' : 'Extérieur',
    title: 'Compositions',
    crests: 1,
  });

  const formation = h('span', { class: 'odds__badge' }, ['—']);
  box.el.querySelector('.panel__aside')?.prepend(formation);

  const pitch = h('div', { class: 'lineup' }, [h('div', { class: 'lineup__pitch' })]);
  const coach = h('div', { class: 'lineup__coach' }, [
    h('span', { class: 't-caption' }, ['Entraîneur']),
    h('span', { class: 'lineup__coach-name' }, ['—']),
  ]);
  const bench = h('div', { class: 'bench' });
  const benchWrap = h('div', { class: 'bench__wrap' }, [
    h('span', { class: 't-caption' }, ['Remplaçants']),
    bench,
  ]);

  box.body.append(pitch, coach);
  if (large) box.body.append(benchWrap);

  // `null` et non `''` : une liste vide produit la signature `''`, donc une
  // sentinelle vide empêcherait le widget de dessiner son état vide.
  let signature: string | null = null;

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      const team = side === 'home' ? state.meta?.home : state.meta?.away;
      box.setCrests([team]);
      box.setHead(
        team?.short ?? (side === 'home' ? 'Domicile' : 'Extérieur'),
        'Compositions',
      );

      const lineup = state.lineups[side];
      // Règle n°6 : pas de composition, pas d'affichage — et surtout pas d'erreur.
      setText(formation, lineup?.formation ?? '—');
      setText(coach.lastElementChild as HTMLElement, lineup?.coach ?? '—');

      const next = lineup
        ? `${side}|${lineup.formation}|${lineup.starters.map((p) => p.id).join(',')}|${state.cards.length}:${state.subs.length}`
        : `${side}|vide`;
      if (next === signature) return;
      signature = next;

      pitch.replaceChildren(h('div', { class: 'lineup__pitch' }));
      bench.replaceChildren();
      if (!lineup) return;

      const coords = positions(lineup.formation, lineup.starters.length);
      lineup.starters.forEach((player, index) => {
        const at = coords[index];
        if (at) pitch.append(buildMan(player, at, index === 0, state, team));
      });

      if (large) {
        for (const player of lineup.bench) {
          bench.append(
            h('span', { class: 'bench__man' }, [
              h('b', {}, [String(player.number)]),
              player.short,
            ]),
          );
        }
      }
    },
  };

  function buildMan(
    player: Player,
    at: { x: number; y: number },
    keeper: boolean,
    state: MatchState,
    team: { color: string; colorAlt?: string; abbr: string; short: string } | undefined,
  ): HTMLElement {
    const jersey = jerseyEl(team, keeper, player.number);

    const card = cardOf(state, player.id);
    if (card) {
      jersey.append(
        h('i', { class: `lineup__mark lineup__mark--${card === 'yellow' ? 'yellow' : 'red'}` }),
      );
    }
    const out = state.subs.find((s) => s.out?.id === player.id);
    if (out) {
      jersey.append(h('i', { class: 'lineup__mark lineup__mark--sub' }));
    }

    const man = h('div', { class: 'lineup__man' }, [
      jersey,
      h('span', { class: 'lineup__name' }, [player.short.toUpperCase()]),
    ]);
    if (out) man.dataset.out = '1';
    man.style.left = `${(at.x * 100).toFixed(2)}%`;
    man.style.top = `${(at.y * 100).toFixed(2)}%`;
    return man;
  }
};

function cardOf(state: MatchState, playerId: string): CardKind | null {
  const found = state.cards.filter((c) => c.player?.id === playerId);
  if (found.length === 0) return null;
  return found.some((c) => c.card !== 'yellow') ? 'red' : 'yellow';
}
