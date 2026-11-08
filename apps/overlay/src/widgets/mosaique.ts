/**
 * La mosaïque : une FICHE par match, au lieu d'une ligne.
 *
 * ── Pourquoi un second bloc à côté du multiplex ─────────────────────────────
 *
 * Le multiplex répond à « que se passe-t-il ailleurs ? » et il y répond bien :
 * vingt lignes, un coup d'œil, on sait les scores. Mais il ne répond pas à la
 * question qui vient juste après, et qui est celle d'une soirée de Coupe
 * d'Europe : « ce 1-0, il est mérité ou ils sont en train de craquer ? ».
 *
 * Une ligne ne peut pas le dire. Une fiche, oui : la possession, les frappes,
 * les tirs cadrés. Et ça ne coûte RIEN — ces chiffres sont déjà dans le
 * tableau de bord global qu'on appelle toutes les quarante-cinq secondes pour
 * les scores. On ne les lisait pas.
 *
 * ── Ce qui décide de la mise en page ────────────────────────────────────────
 *
 * Le nombre de fiches vient du créneau, pas d'une constante : quatre dans un
 * bandeau, neuf en plein écran. Une fiche écrasée ne vaut rien — mieux vaut
 * en montrer six lisibles que douze illisibles, et c'est la règle de tout le
 * plateau.
 *
 * ── Ce qu'on n'affiche pas ──────────────────────────────────────────────────
 *
 * Une fiche sans chiffres ne montre pas des barres à zéro : elle montre le
 * score et la minute, comme une ligne de multiplex, et c'est tout. Des barres
 * vides côte à côte sur neuf fiches donnent l'impression que le plateau est
 * cassé, alors qu'il dit simplement la vérité — la source ne publie pas tout
 * pour toutes les divisions.
 */

import {
  ecuLocal,
  nomCourtCompetition,
  type OtherMatch,
  type Pair,
  type StatsRencontre,
  trierMultiplex,
  vientDeMarquer,
} from '@kz/core';
import { h, setAttr } from '../dom.js';
import { listeAnimee, type EntreeListe } from '../mouvement.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/** Les lignes de chiffres d'une fiche, dans l'ordre de lecture. */
const CHIFFRES: { libelle: string; lire: (s: StatsRencontre) => Pair | undefined }[] = [
  { libelle: 'Tirs', lire: (s) => s.shots },
  { libelle: 'Cadrés', lire: (s) => s.shotsOnTarget },
  { libelle: 'Corners', lire: (s) => s.corners },
];

/** Hauteur d'une fiche, gouttière comprise. Relevée sur le rendu. */
const FICHE = 174;
/** Ce que mange l'en-tête du panneau. */
const CHROME = 76 + 24;

export const mosaique: WidgetFactory = (ctx): Widget => {
  // Combien de fiches par rangée. Deux en colonne, trois en plein écran.
  const colonnes = Math.max(1, Math.min(4, Number(ctx.opts.colonnes) || 3));
  // Pas « Les matchs » : sur la soirée européenne, ce panneau voisine avec le
  // multiplex, dont le titre est « Matchs ». Deux titres presque identiques
  // côte à côte obligent à comparer les contenus pour comprendre lequel est
  // lequel — ce qui est exactement le travail qu'un titre doit éviter.
  const box = panel({ icon: 'live', kicker: 'En direct', title: 'La soirée' });

  const live = h('i', { class: 'mx__live' });
  box.el.querySelector('.panel__aside')?.append(live);

  const grille = h('div', { class: 'mos' });
  grille.style.setProperty('--colonnes', String(colonnes));
  const vide = h('p', { class: 'mx__vide t-caption', hidden: '' }, [
    'Aucun autre match en cours',
  ]);
  box.body.append(grille, vide);

  const liste = listeAnimee(grille);
  const dejaBascule = new Set<string>();

  let signature: string | null = null;

  return {
    el: box.el,
    update({ state, box: slot }: WidgetContext) {
      const tous = state.otherMatches;
      const t = state.t;
      setAttr(live, 'data-on', tous.some((m) => m.live) ? '1' : '0');

      const rangees = slot.h > 0 ? Math.max(1, Math.floor((slot.h - CHROME) / FICHE)) : 3;
      const capacite = rangees * colonnes;
      const montres = trierMultiplex(tous, t, state.meta?.competitionId).slice(0, capacite);

      const next = montres
        .map(
          (m) =>
            `${m.id}:${m.score[0]}-${m.score[1]}:${m.minute}:${vientDeMarquer(m, t) ? 1 : 0}:${
              m.stats ? JSON.stringify(m.stats) : ''
            }`,
        )
        .join('|');
      if (next === signature) return;
      signature = next;

      vide.hidden = montres.length > 0;

      // Même mémoire que le multiplex : la bascule de but ne joue qu'une fois,
      // sinon elle repart à chaque minute qui avance quelque part.
      for (const id of [...dejaBascule]) {
        const m = tous.find((x) => x.id === id);
        if (!m || !vientDeMarquer(m, t)) dejaBascule.delete(id);
      }

      const entrees: EntreeListe[] = montres.map((m) => {
        const neuf = vientDeMarquer(m, t) && !dejaBascule.has(m.id);
        if (neuf) dejaBascule.add(m.id);
        return { cle: m.id, faire: () => fiche(m, t, neuf) };
      });
      liste.rendre(entrees);
    },
  };
};

function fiche(match: OtherMatch, t: number, neuf: boolean): HTMLElement {
  const butant = vientDeMarquer(match, t);

  // ── L'en-tête de la fiche : la compétition et la minute ──
  const court = nomCourtCompetition(match.competitionId, match.competition ?? '');
  const marque = h('div', { class: 'mos__ligue' });
  const url = ecuLocal(match.competitionCrest);
  if (url) {
    const img = h('img', { class: 'mos__ligue-logo', src: url, alt: court, loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(h('span', {}, [court])));
    marque.append(img);
  } else if (court) {
    marque.append(h('span', {}, [court]));
  }

  const enJeu = match.minute !== '—' && /\d/.test(match.minute);
  const minute = h('span', { class: 'mos__minute' }, [
    match.minute === '—' ? heure(match.kickoff) : enJeu ? `${match.minute}'` : match.minute,
  ]);
  if (!match.live) minute.dataset.off = '1';

  const tete = h('div', { class: 'mos__tete' }, [marque, minute]);
  if (butant) tete.append(h('span', { class: 'mx__but' }, [h('i', { class: 'mx__ballon' }), 'BUT']));

  // ── Les deux équipes et le score ──
  const rangs = h('div', { class: 'mos__equipes' });
  for (const [equipe, buts, cote] of [
    [match.home, match.score[0], 'home'],
    [match.away, match.score[1], 'away'],
  ] as const) {
    const crest = crestEl('mos__crest');
    paintCrest(crest, equipe);
    const ligne = h('div', { class: 'mos__equipe' }, [
      crest,
      h('span', { class: 'mos__nom' }, [equipe.short.toUpperCase()]),
      h('span', { class: 'mos__buts' }, [String(buts)]),
    ]);
    // Le camp qui mène ressort. Sur une fiche, le score est déjà gros ; c'est
    // le NOM qu'on cherche, et c'est lui qu'on éclaire.
    if (match.score[0] !== match.score[1]) {
      const mene = cote === 'home' ? match.score[0] > match.score[1] : match.score[1] > match.score[0];
      if (mene) ligne.dataset.mene = '1';
    }
    rangs.append(ligne);
  }

  const el = h('div', { class: 'mos__fiche' }, [tete, rangs]);

  // ── Les chiffres, s'il y en a ──
  const s = match.stats;
  if (s) {
    const bloc = h('div', { class: 'mos__chiffres' });

    if (s.possession) {
      const [a, b] = s.possession;
      const somme = a + b;
      const part = somme > 0 ? a / somme : 0.5;
      const jauge = h('i', { class: 'mos__jauge-part' });
      jauge.style.transform = `scaleX(${part.toFixed(4)})`;
      bloc.append(
        h('div', { class: 'mos__poss' }, [
          h('span', { class: 'mos__poss-val' }, [`${Math.round(a)}%`]),
          h('div', { class: 'mos__jauge' }, [jauge]),
          h('span', { class: 'mos__poss-val mos__poss-val--droite' }, [`${Math.round(b)}%`]),
        ]),
      );
    }

    for (const c of CHIFFRES) {
      const paire = c.lire(s);
      if (!paire) continue;
      bloc.append(
        h('div', { class: 'mos__duo' }, [
          h('span', { class: 'mos__duo-val' }, [String(Math.round(paire[0]))]),
          h('span', { class: 'mos__duo-nom t-caption' }, [c.libelle]),
          h('span', { class: 'mos__duo-val mos__duo-val--droite' }, [String(Math.round(paire[1]))]),
        ]),
      );
    }

    if (bloc.childElementCount > 0) el.append(bloc);
  }

  if (butant) el.dataset.but = '1';
  if (neuf) el.dataset.neuf = '1';
  return el;
}

/** L'heure de coup d'envoi, dans le fuseau de la machine qui diffuse. */
function heure(kickoff: number | undefined): string {
  if (kickoff === undefined || !Number.isFinite(kickoff)) return '—';
  const d = new Date(kickoff);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
