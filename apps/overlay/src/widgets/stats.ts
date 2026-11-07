/**
 * Les statistiques.
 *
 * ── Le défaut de la première version ────────────────────────────────────────
 *
 * Huit barres identiques, dans l'ordre où les chiffres me venaient. « Cartons
 * jaunes » avait exactement le même poids visuel que « Tirs cadrés », et une
 * ligne « xG » restait vide en permanence parce qu'ESPN n'en publie pas. Un
 * tableau sans hiérarchie n'aide personne : l'œil ne sait pas où aller, et
 * tout finit par se lire comme du remplissage.
 *
 * ── Ce qui compte quand on n'a pas les images ───────────────────────────────
 *
 * La possession est le chiffre le plus affiché à la télévision et l'un des
 * moins prédictifs : on peut tenir le ballon soixante-dix minutes sans jamais
 * inquiéter personne. Ce qui dit le match, c'est le DANGER — combien de
 * frappes, prises d'où, et à quelle distance. C'est pour ça que la carte des
 * tirs existe, et c'est pour ça que ce bloc commence maintenant par là.
 *
 * Trois sections, dans cet ordre, parce que c'est l'ordre dans lequel on
 * raconte un match :
 *
 *   DANGER    ce qui crée des buts
 *   MAÎTRISE  qui tient le ballon, et s'il en fait quelque chose
 *   LE JEU    corners, fautes, discipline — le rythme
 *
 * ── Deux chiffres que personne n'affiche ────────────────────────────────────
 *
 * « Dans la surface » et « Distance moyenne » ne viennent d'aucun fournisseur :
 * ils sont CALCULÉS depuis les positions de frappe qu'on garde déjà pour la
 * carte des tirs. Deux équipes à « 12 tirs » chacune n'ont rien à voir si
 * l'une frappe à 14 m et l'autre à 27 — et c'est exactement l'écart qu'aucun
 * tableau classique ne montre.
 *
 * ── L'absence, dite une fois ────────────────────────────────────────────────
 *
 * Une donnée que la source ne publie pas ne laisse plus une ligne de tirets :
 * elle disparaît, et une note en bas dit laquelle. Un tiret répété à chaque
 * rafraîchissement finit par se lire comme une panne, alors qu'une phrase dit
 * la vérité une bonne fois.
 */

import { dansLaSurface, distanceDuBut, type MatchState, type Pair, type ShotEntry } from '@kz/core';
import { h, setScaleX, setText } from '../dom.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const NS = 'http://www.w3.org/2000/svg';
const CIRCUMFERENCE = 2 * Math.PI * 46;

interface Row {
  label: string;
  /** `undefined` quand le fournisseur ne publie pas cette donnée. */
  read: (s: MatchState) => Pair | undefined;
  format?: (v: number) => string;
  /**
   * Pour les grandeurs où le PLUS PETIT est le meilleur — une distance de
   * frappe. Sans ce drapeau, l'équipe qui frappe à 14 m verrait sa barre à
   * 34 %, soit l'inverse exact de ce que le chiffre raconte.
   */
  invert?: boolean;
}

/** Les frappes d'un camp dont on connaît la position. */
function placees(state: MatchState, side: 'home' | 'away'): ShotEntry[] {
  return state.shots.filter((s) => s.side === side && s.x !== undefined && s.y !== undefined);
}

/** Une paire calculée sur les deux camps, ou `undefined` si rien n'est plaçable. */
function pairePlacee(
  state: MatchState,
  calcul: (shots: ShotEntry[]) => number | null,
): Pair | undefined {
  const d = calcul(placees(state, 'home'));
  const e = calcul(placees(state, 'away'));
  if (d === null || e === null) return undefined;
  return [d, e];
}

const DANGER: Row[] = [
  { label: 'Tirs cadrés', read: (s) => s.stats.shotsOnTarget },
  {
    label: 'Dans la surface',
    read: (s) =>
      pairePlacee(s, (shots) => (shots.length === 0 ? null : shots.filter(dansLaSurface).length)),
  },
  {
    label: 'Distance moyenne',
    invert: true,
    read: (s) =>
      pairePlacee(s, (shots) => {
        if (shots.length === 0) return null;
        const total = shots.reduce((somme, shot) => somme + (distanceDuBut(shot) ?? 0), 0);
        return total / shots.length;
      }),
    format: (v) => `${Math.round(v)} m`,
  },
  { label: 'xG', read: (s) => s.stats.xg, format: (v) => v.toFixed(2) },
];

const MAITRISE: Row[] = [
  { label: 'Tirs (total)', read: (s) => s.stats.shots },
  {
    label: 'Précision de passe',
    read: (s) => (s.stats.passAccuracy[0] === 0 && s.stats.passAccuracy[1] === 0
      ? undefined
      : s.stats.passAccuracy),
    format: (v) => `${Math.round(v)} %`,
  },
  { label: 'Passes', read: (s) => s.stats.passes },
];

const LE_JEU: Row[] = [
  { label: 'Corners', read: (s) => s.stats.corners },
  { label: 'Fautes', read: (s) => s.stats.fouls },
  { label: 'Hors-jeu', read: (s) => s.stats.offsides },
  { label: 'Cartons jaunes', read: (s) => s.stats.yellowCards },
];

interface Section {
  titre: string;
  rows: Row[];
  /** Les sections secondaires n'apparaissent que là où il y a la place. */
  large?: boolean;
}

const SECTIONS: Section[] = [
  { titre: 'Danger', rows: DANGER },
  { titre: 'Maîtrise', rows: MAITRISE },
  { titre: 'Le jeu', rows: LE_JEU, large: true },
];

export const stats: WidgetFactory = (ctx): Widget => {
  const large = ctx.opts.large === true;
  const box = panel({ icon: 'stats', kicker: 'En direct', title: 'Statistiques', crests: 2 });

  const possHome = h('div', { class: 'ring__value t-xl' }, ['50%']);
  const possAway = h('div', { class: 'ring__value t-xl' }, ['50%']);

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 108 108');
  const track = document.createElementNS(NS, 'circle');
  track.setAttribute('cx', '54');
  track.setAttribute('cy', '54');
  track.setAttribute('r', '46');
  track.setAttribute('stroke', 'var(--pill)');
  const arc = document.createElementNS(NS, 'circle');
  arc.setAttribute('cx', '54');
  arc.setAttribute('cy', '54');
  arc.setAttribute('r', '46');
  arc.setAttribute('stroke', 'var(--accent)');
  arc.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
  arc.style.transition = 'stroke-dashoffset var(--dur-base) var(--ease)';
  svg.append(track, arc);

  const dial = h('div', { class: 'ring__dial' }, [
    svg,
    h('div', { class: 'ring__label' }, ['Possession']),
  ]);
  const ring = h('div', { class: 'ring' }, [possHome, dial, possAway]);

  interface Ligne {
    row: Row;
    home: HTMLElement;
    away: HTMLElement;
    fill: HTMLElement;
    node: HTMLElement;
  }

  const built: Ligne[] = [];
  const sections: { el: HTMLElement; rows: Ligne[] }[] = [];
  const corps = h('div', { class: 'stats__sections' });

  for (const section of SECTIONS) {
    if (section.large && !large) continue;
    const barres = h('div', { class: 'bars' });
    const lignes: Ligne[] = [];
    for (const row of section.rows) {
      const home = h('span', { class: 'bar__num t-l' }, ['0']);
      const away = h('span', { class: 'bar__num bar__num--away t-l' }, ['0']);
      const fill = h('i', { class: 'bar__fill' });
      // Le libellé vit ENTRE les deux chiffres qu'il compare, à l'intérieur de
      // la piste : c'est la lecture d'un bandeau de télévision, et ça rend à
      // la colonne les vingt pixels par ligne que coûtait un titre au-dessus.
      const node = h('div', { class: 'bar' }, [
        h('div', { class: 'bar__track' }, [
          fill,
          home,
          h('span', { class: 'bar__label t-label' }, [row.label]),
          away,
        ]),
      ]);
      const ligne: Ligne = { row, home, away, fill, node };
      built.push(ligne);
      lignes.push(ligne);
      barres.append(node);
    }
    const el = h('div', { class: 'stats__section' }, [
      h('div', { class: 'stats__rubrique t-kicker' }, [section.titre]),
      barres,
    ]);
    sections.push({ el, rows: lignes });
    corps.append(el);
  }

  const wrap = h('div', { class: large ? 'stats stats--large' : 'stats' }, [ring, corps]);
  box.body.append(wrap);

  /** Hauteur en dessous de laquelle l'anneau et les barres doivent maigrir. */
  const DENSE_UNDER = 560;
  /**
   * Hauteur par ligne en dessous de laquelle les caractères doivent maigrir.
   * Mesurée sur `slot.h`, donc stable : la déduire de la piste réellement
   * rendue ferait osciller la mise en page, puisque la taille du texte change
   * à son tour la hauteur de la piste.
   */
  const SERRE_SOUS = 46;

  let signatureParts = '';

  return {
    el: box.el,
    update({ state, box: slot }: WidgetContext) {
      // Le widget connaît la taille de son créneau : il s'y adapte plutôt que
      // de déborder. C'est au contenu de céder, jamais au cadre.
      const dense = slot.h > 0 && slot.h < DENSE_UNDER ? '1' : '0';
      if (wrap.dataset.dense !== dense) wrap.dataset.dense = dense;

      box.setCrests([state.meta?.home, state.meta?.away]);

      const [ph, pa] = state.stats.possession;
      setText(possHome, `${Math.round(ph)}%`);
      setText(possAway, `${Math.round(pa)}%`);
      const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, ph / 100)));
      const next = String(offset.toFixed(1));
      if (arc.getAttribute('stroke-dashoffset') !== next) {
        arc.setAttribute('stroke-dashoffset', next);
      }

      for (const { row, home, away, fill, node } of built) {
        const paire = row.read(state);
        if (!paire) {
          // La ligne s'efface, et RIEN ne la remplace. Une version précédente
          // écrivait « non publié par la source : les buts attendus » en bas
          // du panneau : c'est du texte de développeur à l'antenne, qui parle
          // d'un fournisseur dont le spectateur ignore jusqu'au nom. Une
          // donnée absente est simplement absente.
          node.hidden = true;
          continue;
        }
        node.hidden = false;
        const [a, b] = paire;
        const format = row.format ?? ((v: number) => String(Math.round(v)));
        setText(home, format(a));
        setText(away, format(b));

        const somme = a + b;
        if (somme === 0) setScaleX(fill, 0.5);
        else setScaleX(fill, row.invert ? b / somme : a / somme);
      }

      // ── La répartition de la hauteur ──────────────────────────────────────
      //
      // Chaque rubrique reçoit une part proportionnelle à son nombre de lignes
      // VISIBLES, et la mise en page se charge du reste. La première version
      // comptait les pixels à la main — hauteur de l'anneau, du titre, de la
      // note — se trompait d'une trentaine, et la note venait se poser sur la
      // dernière ligne. Un comptage faux ne se corrige pas, il se remplace.
      const lignes = built.filter((b) => !b.node.hidden).length;
      const parts = sections.map((s) => s.rows.filter((r) => !r.node.hidden).length);
      const serre = lignes > 0 && slot.h > 0 && slot.h / lignes < SERRE_SOUS ? '1' : '0';
      const prochaine = `${parts.join(',')}|${serre}`;
      if (prochaine !== signatureParts) {
        signatureParts = prochaine;
        sections.forEach((s, i) => {
          // Une rubrique dont toutes les lignes sont masquées disparaît : son
          // titre seul ne dirait rien, et laisserait un filet doré en l'air.
          s.el.hidden = parts[i] === 0;
          s.el.style.flexGrow = String(parts[i]);
        });
        wrap.dataset.serre = serre;
      }
    },
  };
};
