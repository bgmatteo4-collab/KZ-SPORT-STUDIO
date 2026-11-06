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

const NS = 'http://www.w3.org/2000/svg';

/**
 * Le demi-terrain, vu depuis la ligne de but : surface de réparation en bas,
 * rond central entamé en haut. Sans tracé, onze maillots alignés ne sont
 * qu'une grille ; avec, c'est une composition.
 */
function pitchSvg(): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'lineup__pitch');
  svg.setAttribute('viewBox', '0 0 100 150');
  svg.setAttribute('preserveAspectRatio', 'none');

  const add = (tag: string, attrs: Record<string, string>) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  };

  add('rect', { x: '2', y: '2', width: '96', height: '146', rx: '3' });
  add('rect', { x: '24', y: '108', width: '52', height: '40' });
  add('rect', { x: '38', y: '129', width: '24', height: '19' });
  add('circle', { cx: '50', cy: '124', r: '1.2', class: 'lineup__spot' });
  add('path', { d: 'M35 108 A18 18 0 0 0 65 108' });
  add('path', { d: 'M27 2 A25 25 0 0 0 73 2' });
  return svg;
}

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
  const out: { x: number; y: number }[] = [{ x: 0.5, y: 0.885 }]; // le gardien, dans sa surface

  const top = 0.19;
  const bottom = 0.72;
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
  // Avant le coup d'envoi, on annonce une composition PROBABLE. ESPN ne publie
  // la vraie qu'environ une heure avant ; tant qu'elle n'est pas là, un terrain
  // vide sans explication passe pour une panne.
  const probable = ctx.opts.probable === true;

  const box = panel({
    icon: 'lineup',
    kicker: side === 'home' ? 'Domicile' : 'Extérieur',
    // Le titre reste court : « Composition probable » déborde de l'en-tête et
    // s'affiche « Composition prob… ». Le mot « probable » vit dans un badge,
    // où il est lu aussi bien et ne rogne rien.
    title: 'Compositions',
    crests: 1,
  });

  const formation = h('span', { class: 'odds__badge' }, ['—']);
  box.el.querySelector('.panel__aside')?.prepend(formation);
  if (probable) {
    box.el
      .querySelector('.panel__aside')
      ?.prepend(h('span', { class: 'odds__badge odds__badge--doux' }, ['probable']));
  }

  const attenteCompo = h('p', { class: 'lineup__attente t-caption', hidden: '' }, [
    'Composition annoncée environ une heure avant le coup d’envoi.',
  ]);

  const pitch = h('div', { class: 'lineup' }, [pitchSvg()]);
  const coach = h('div', { class: 'lineup__coach' }, [
    h('span', { class: 't-caption' }, ['Entraîneur']),
    h('span', { class: 'lineup__coach-name' }, ['—']),
  ]);
  const bench = h('div', { class: 'bench' });
  const benchWrap = h('div', { class: 'bench__wrap' }, [
    h('span', { class: 't-caption' }, ['Remplaçants']),
    bench,
  ]);

  box.body.append(pitch, attenteCompo, coach);
  if (large) box.body.append(benchWrap);

  // `null` et non `''` : une liste vide produit la signature `''`, donc une
  // sentinelle vide empêcherait le widget de dessiner son état vide.
  let signature: string | null = null;

  return {
    el: box.el,
    update({ state, box: slot }: WidgetContext) {
      // Les maillots grandissent avec le panneau. À taille fixe, onze maillots
      // de 50 px dans un panneau de 900 font une composition qui flotte.
      // « COMPOSITIONS » ne tient pas dans l'en-tête d'une colonne étroite :
      // il s'affichait « COMPOSITIO… ». On resserre le titre plutôt que de le
      // laisser couper — un mot tronqué dans un en-tête fait négligé.
      const etroit = slot.w > 0 && slot.w < 560;
      box.el.dataset.etroit = etroit ? '1' : '0';

      if (slot.w > 0) {
        const size = Math.round(Math.min(118, Math.max(46, slot.w * 0.105)));
        if (pitch.style.getPropertyValue('--jersey') !== `${size}px`) {
          pitch.style.setProperty('--jersey', `${size}px`);
        }
      }

      const team = side === 'home' ? state.meta?.home : state.meta?.away;
      box.setCrests([team]);
      box.setHead(
        team?.short ?? (side === 'home' ? 'Domicile' : 'Extérieur'),
        // « COMPO » dans une colonne étroite : c'est l'abréviation qu'emploie
        // le football français, et elle tient. « COMPOSITIO… » ne tient pas.
        etroit ? 'Compo' : 'Compositions',
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

      pitch.replaceChildren(pitchSvg());
      bench.replaceChildren();
      // Dire POURQUOI c'est vide. Un terrain nu sans un mot ressemble à une
      // panne ; la phrase transforme l'absence en information.
      attenteCompo.hidden = Boolean(lineup) || !probable;
      if (!lineup) return;

      const coords = positions(lineup.formation, lineup.starters.length);

      // La largeur maximale d'une pastille de nom vient de la RANGÉE LA PLUS
      // CHARGÉE : sans ça, « GACINOVIC » et « KAIRINEN » côte à côte dans une
      // ligne de quatre se chevauchent — défaut repéré en mesurant les boîtes
      // de tous les écrans, et invisible tant qu'on ne tombe pas sur deux noms
      // longs voisins.
      //
      // La rangée se lit dans la FORMATION, pas dans les coordonnées. Première
      // version : regrouper les joueurs par `y` arrondi. Deux rangées proches
      // tombaient sur le même entier, la plus chargée en comptait sept au lieu
      // de quatre, et les noms se retrouvaient coupés à une lettre.
      const lignes = lineup.formation
        .split('-')
        .map((n) => Number.parseInt(n, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      const plusChargee = lignes.length > 0 ? Math.max(...lignes) : 4;

      // En PIXELS, pas en pourcentage : la pastille est enfant d'un conteneur
      // positionné qui fait la largeur du maillot, et un pourcentage s'y
      // rapporterait au lieu de se rapporter au terrain.
      //
      // Et l'écart entre deux voisins vaut la largeur divisée par n+1, pas par
      // n : les joueurs sont posés à (i+1)/(n+1), ce qui laisse une demi-case
      // à chaque bord. Diviser par n donnait une borne PLUS LARGE que la place
      // réelle, et les noms se chevauchaient encore.
      const largeurPiste = pitch.clientWidth || slot.w;
      const cap = Math.max(60, Math.floor(largeurPiste / (plusChargee + 1)) - 6);
      pitch.style.setProperty('--largeur-nom', `${cap}px`);

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
