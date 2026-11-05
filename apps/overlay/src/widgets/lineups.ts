/**
 * Les compositions : des maillots disposés selon la formation, avec le nom en
 * pilule dessous et les marqueurs — carton, remplacement — collés au maillot.
 */

import type { CardKind, LineupPayload, MatchState, Player, Side } from '@kz/core';
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

/** Place chaque joueur en coordonnées normalisées du panneau. */
function positions(formation: string, count: number): { x: number; y: number }[] {
  const rows = parseFormation(formation);
  const out: { x: number; y: number }[] = [{ x: 0.5, y: 0.93 }]; // le gardien

  const top = 0.1;
  const bottom = 0.78;
  rows.forEach((n, rowIndex) => {
    const y = bottom - ((bottom - top) * rowIndex) / Math.max(1, rows.length - 1);
    for (let i = 0; i < n; i += 1) {
      out.push({ x: (i + 1) / (n + 1), y });
    }
  });

  return out.slice(0, count);
}

export const lineups: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'lineup', kicker: 'Domicile', title: 'Compositions', crests: 2 });
  const pitch = h('div', { class: 'lineup' }, [h('div', { class: 'lineup__pitch' })]);
  box.body.append(pitch);

  let signature = '';
  let side: Side = 'home';

  return {
    el: box.el,
    update(ctx: WidgetContext) {
      const { state } = ctx;
      box.setCrests([state.meta?.home, state.meta?.away]);
      box.setHead(side === 'home' ? 'Domicile' : 'Extérieur', 'Compositions');

      const lineup = state.lineups[side];
      // Règle n°6 : pas de composition, pas d'affichage — et surtout pas d'erreur.
      const next = lineup
        ? `${side}|${lineup.formation}|${lineup.starters.map((p) => p.id).join(',')}|${markSignature(state)}`
        : `${side}|vide`;
      if (next === signature) return;
      signature = next;

      pitch.replaceChildren(h('div', { class: 'lineup__pitch' }));
      if (!lineup) return;

      const coords = positions(lineup.formation, lineup.starters.length);
      lineup.starters.forEach((player, index) => {
        const at = coords[index];
        if (!at) return;
        pitch.append(buildMan(player, at, index === 0, state, side, lineup));
      });
    },
  };

  function buildMan(
    player: Player,
    at: { x: number; y: number },
    keeper: boolean,
    state: MatchState,
    which: Side,
    lineup: LineupPayload,
  ): HTMLElement {
    const team = which === 'home' ? state.meta?.home : state.meta?.away;
    const jersey = jerseyEl(team, keeper);

    const card = cardOf(state, player.id);
    if (card) {
      jersey.append(
        h('i', { class: `lineup__mark lineup__mark--${card === 'yellow' ? 'yellow' : 'red'}` }),
      );
    }
    if (state.subs.some((s) => s.out?.id === player.id)) {
      jersey.append(h('i', { class: 'lineup__mark lineup__mark--sub' }));
    }

    const man = h('div', { class: 'lineup__man' }, [
      jersey,
      h('span', { class: 'lineup__name' }, [player.short.toUpperCase()]),
    ]);
    man.style.left = `${(at.x * 100).toFixed(2)}%`;
    man.style.top = `${(at.y * 100).toFixed(2)}%`;
    void lineup;
    return man;
  }
};

function cardOf(state: MatchState, playerId: string): CardKind | null {
  const found = state.cards.filter((c) => c.player?.id === playerId);
  if (found.length === 0) return null;
  return found.some((c) => c.card !== 'yellow') ? 'red' : 'yellow';
}

/** Change dès qu'un carton ou un remplacement modifie l'affichage. */
function markSignature(state: MatchState): string {
  return `${state.cards.length}:${state.subs.length}`;
}

void setText;
