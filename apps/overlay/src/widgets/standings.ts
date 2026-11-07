/**
 * Le classement.
 *
 * Mise en page d'antenne : chaque ligne est une PILULE continue, avec le bloc
 * de rang soudé à son extrémité gauche — coloré par zone de qualification — et
 * le total de points soudé à droite. Entre les deux, l'écu, le nom en
 * capitales, puis les matchs joués et la différence de buts en petit.
 *
 * ── Les deux défauts que la réécriture corrige ──────────────────────────────
 *
 * 1. IL NE PARLAIT PAS DU MATCH. La régie montre ce panneau après un but,
 *    avec ce motif : « c'est ce que le spectateur se demande ». Le tableau
 *    affiché ne portait aucune trace du but, et rien ne distinguait les deux
 *    équipes à l'antenne des dix-huit autres. On répondait à la question par
 *    le tableau d'hier.
 *
 * 2. IL COUPAIT PAR LE HAUT. Une colonne tient huit lignes ; un championnat en
 *    compte vingt. On montrait les huit premières — donc Fluminense, 4e, et
 *    pas Vitória, 15e, alors que c'était ce match-là qu'on commentait. Le
 *    panneau devenait décoratif au moment précis où il avait une raison.
 *
 * `opts.large` passe à deux colonnes : vingt lignes sur une seule demandent
 * une hauteur qu'aucune scène n'a.
 */

import { classementProjete, type LigneProjetee, paireCouleurs, tranche } from '@kz/core';
import { h, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const standings: WidgetFactory = (ctx): Widget => {
  const large = ctx.opts.large === true;
  const box = panel({ icon: 'table', kicker: 'Championnat', title: 'Classement' });

  const grid = h('div', { class: large ? 'table table--two' : 'table' });
  // Dire quand le tableau est une PROJECTION. Un classement d'antenne est lu
  // comme un fait ; celui-ci est une hypothèse — « si le match finissait
  // ainsi » — et le taire serait une affirmation fausse.
  const note = h('p', { class: 'table__note t-caption', hidden: '' }, ['']);
  box.body.append(grid, note);

  let signature: string | null = null;

  /** Hauteur d'une ligne, gouttière comprise. */
  const ROW = 54;
  /** Ce que mangent l'en-tête du panneau et la ligne de titres. */
  const CHROME = 76 + 34 + 24;
  /** Et la note du bas, sur deux lignes dans une colonne étroite. */
  const NOTE = 46;

  return {
    el: box.el,
    update({ state, box: slot }: WidgetContext) {
      const projection = classementProjete(
        state.standings,
        state.meta?.home,
        state.meta?.away,
        state.score,
        state.phase,
      );

      const texte = projection.projete
        ? 'Projection : le résultat en cours est appliqué au tableau publié.'
        : projection.raison === 'deja-compte'
          ? 'Tableau à jour, ce match y est déjà compté.'
          : '';

      // Vingt lignes ne tiennent pas dans une colonne de cinq cents pixels. On
      // montre ce qui tient, plutôt que de laisser le cadre couper une ligne
      // en deux — à l'antenne, une ligne tranchée se voit bien plus qu'une
      // ligne absente.
      //
      // La note du bas est comptée AVANT, pas après : l'oublier mangeait
      // exactement une ligne, et c'était la dernière — donc justement celle
      // des deux équipes qui jouent, que toute cette réécriture sert à
      // montrer.
      const dispo = slot.h - CHROME - (texte ? NOTE : 0);
      const perColumn = slot.h > 0 ? Math.max(3, Math.floor(dispo / ROW)) : projection.rows.length;
      const capacity = large ? perColumn * 2 : perColumn;
      const shown = tranche(projection.rows, capacity);

      const next = `${shown.length}|${projection.projete}|${shown
        .map((r) => `${r.rank}:${r.points}:${r.diff}:${r.bouge}:${r.enJeu ? 1 : 0}`)
        .join('|')}`;
      if (next === signature) return;
      signature = next;

      box.setHead(projection.projete ? 'Si le match finissait ainsi' : 'Championnat', 'Classement');
      note.hidden = texte === '';
      setText(note, texte);

      grid.replaceChildren();
      if (shown.length === 0) return;

      // La même paire que la carte des tirs et le fil : les deux lignes en jeu
      // portent la couleur sous laquelle le reste du plateau les montre.
      const teintes = paireCouleurs(state.meta?.home, state.meta?.away);

      // En grand : deux colonnes égales, la première moitié puis la seconde.
      const columns = large
        ? [shown.slice(0, Math.ceil(shown.length / 2)), shown.slice(Math.ceil(shown.length / 2))]
        : [shown];

      for (const rows of columns) {
        if (rows.length === 0) continue;
        const column = h('div', { class: 'table__col' }, [header()]);
        let precedent: number | null = null;
        for (const row of rows) {
          // La fenêtre a sauté des places : le dire. Sans ce trait, passer de
          // la 3e à la 12e ligne se lit comme un tableau faux.
          if (precedent !== null && row.rank > precedent + 1) {
            column.append(h('div', { class: 'table__saut' }));
          }
          precedent = row.rank;
          column.append(buildRow(row, teintes, state.meta?.home));
        }
        grid.append(column);
      }
    },
  };
};

function header(): HTMLElement {
  return h('div', { class: 'table__head t-caption' }, [
    h('span', {}, ['#']),
    h('span', {}, ['']),
    h('span', {}, ['Équipe']),
    h('span', { class: 'table__num' }, ['J']),
    h('span', { class: 'table__num' }, ['Diff']),
    h('span', { class: 'table__num' }, ['Pts']),
  ]);
}

function buildRow(
  row: LigneProjetee,
  teintes: { home: string; away: string },
  home: { id?: string; short: string } | undefined,
): HTMLElement {
  const crest = crestEl('table__crest');
  paintCrest(crest, row.team);

  const rank = h('span', { class: 'table__rank' }, [String(row.rank)]);
  if (row.zone) rank.dataset.zone = row.zone;

  // Le nom et la flèche vivent dans la MÊME cellule : la ligne est une grille
  // à six colonnes fixes, et y glisser un septième enfant décalerait tout le
  // tableau d'un cran.
  const nom = h('span', { class: 'table__name' }, [
    h('span', { class: 'table__nom' }, [row.team.short.toUpperCase()]),
  ]);

  const ligne = h('div', { class: 'table__row' }, [
    rank,
    crest,
    nom,
    h('span', { class: 'table__num' }, [String(row.played)]),
    h('span', { class: 'table__num' }, [row.diff > 0 ? `+${row.diff}` : String(row.diff)]),
    h('span', { class: 'table__pts' }, [String(row.points)]),
  ]);

  // Les deux équipes à l'antenne, mises en avant. C'est la seule chose que le
  // spectateur cherche dans ce tableau à cet instant.
  if (row.enJeu) {
    ligne.dataset.enjeu = '1';
    const estDom = home
      ? home.id && row.team.id
        ? home.id === row.team.id
        : home.short === row.team.short
      : false;
    ligne.style.setProperty('--teinte', estDom ? teintes.home : teintes.away);
    // Et de combien le match les fait bouger, quand il les fait bouger.
    if (row.bouge !== 0) {
      const fleche = h('span', { class: 'table__bouge' }, [
        `${row.bouge > 0 ? '▲' : '▼'}${Math.abs(row.bouge)}`,
      ]);
      fleche.dataset.sens = row.bouge > 0 ? 'haut' : 'bas';
      nom.append(fleche);
    }
  }

  return ligne;
}
