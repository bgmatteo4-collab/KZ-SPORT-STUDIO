/**
 * La feuille de match : la chronologie, lue par camps.
 *
 * Disposition d'antenne : la minute au centre, les faits du domicile à gauche,
 * ceux de l'extérieur à droite. On lit la dynamique du match d'un coup d'œil —
 * une colonne qui se remplit d'un seul côté raconte une domination.
 *
 * ── Ce que la réécriture a enlevé ───────────────────────────────────────────
 *
 * Ce bloc fabriquait ses propres libellés : « Carton jaune », « Passe de… »,
 * « Contre son camp ». Le fil du match en fabriquait d'autres, la carte des
 * tirs d'autres encore. Trois blocs, trois vocabulaires, et la garantie qu'un
 * jour l'un dirait « Second jaune » quand l'autre dirait « Deuxième jaune ».
 *
 * Tout vient maintenant de `state.feed`, qui porte le type, le poids et le
 * libellé. La feuille ne décide plus que d'une chose — ce qu'elle MONTRE — et
 * c'est bien son seul rôle de mise en page.
 *
 * ── Ce que ça a ajouté ──────────────────────────────────────────────────────
 *
 * Les tirs cadrés. Une feuille de match classique ne liste que buts, cartons
 * et remplacements, parce qu'à la télévision les images racontent le reste.
 * Ici il n'y a pas d'images : « 34' tir cadré de Vinícius » est précisément le
 * genre de ligne qui manquait.
 */

import { type FaitEntry, LIBELLE, VALEUR_FIL, detailDuFait } from '@kz/core';
import { h } from '../dom.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/**
 * Le plancher d'intérêt retenu.
 *
 * À 3, on garde buts, expulsions, penalties, tirs cadrés, avertissements et
 * remplacements. On laisse donc dehors corners, hors-jeu, coups francs et
 * tirs contrés : une feuille de match n'est pas un relevé exhaustif, c'est ce
 * qu'on recopie dans un carnet.
 */
const PLANCHER = 3;

export const sheet: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'clock', kicker: 'Chronologie', title: 'Feuille de match', crests: 2 });
  const list = h('div', { class: 'sheet' });
  box.body.append(list);

  // `null` et non `''` : une liste vide produit la signature `''`, donc une
  // sentinelle vide empêcherait le widget de dessiner son état vide.
  let signature: string | null = null;

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      box.setCrests([state.meta?.home, state.meta?.away]);

      const faits = state.feed.filter((f) => VALEUR_FIL[f.kind] >= PLANCHER);
      const next = faits.map((f) => `${f.kind}${f.seq}`).join(',');
      if (next === signature) return;
      signature = next;

      list.replaceChildren();
      if (faits.length === 0) {
        list.append(h('div', { class: 'sheet__empty t-label' }, ['Aucun fait de jeu.']));
        return;
      }

      for (const fait of faits) {
        const cell = h('div', { class: 'sheet__fact' }, [
          h('i', { class: 'sheet__mark', 'data-kind': fait.kind }),
          h('span', { class: 'sheet__who' }, [qui(fait)]),
          h('span', { class: 'sheet__what t-label' }, [quoi(fait)]),
        ]);
        const line = h('div', { class: 'sheet__row', 'data-side': fait.side }, [
          fait.side === 'home' ? cell : h('span'),
          h('span', { class: 'sheet__minute' }, [`${fait.minute}'`]),
          fait.side === 'away' ? cell : h('span'),
        ]);
        list.append(line);
      }
    },
  };
};

/** La ligne du haut : le nom, parce que c'est ce qu'on cherche. */
function qui(fait: FaitEntry): string {
  if (fait.kind === 'own_goal') return fait.player?.short ?? 'Contre son camp';
  if (fait.kind === 'sub') return fait.second?.short ?? fait.player?.short ?? '—';
  return fait.player?.short ?? LIBELLE[fait.kind];
}

/**
 * La ligne du bas : la nature du fait, et son détail quand il en a un.
 *
 * On ne répète pas le nom déjà écrit au-dessus : `detailDuFait` le place en
 * tête, donc on ne garde ici que ce qui vient après — la distance d'une
 * frappe, le passeur d'un but, le sortant d'un remplacement.
 */
function quoi(fait: FaitEntry): string {
  if (fait.kind === 'sub') {
    const sortant = fait.player?.short;
    return sortant ? `Sort : ${sortant}` : 'Remplacement';
  }
  const detail = detailDuFait(fait);
  const nom = fait.player?.short;
  const reste = nom && detail.startsWith(nom) ? detail.slice(nom.length).replace(/^,\s*/, '') : detail;
  return reste ? `${LIBELLE[fait.kind]} · ${reste}` : LIBELLE[fait.kind];
}
