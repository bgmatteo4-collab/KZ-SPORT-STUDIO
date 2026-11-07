/**
 * Le fil du match.
 *
 * ── Ce qu'on perd sans les images, et que rien ne remplaçait ────────────────
 *
 * Un tableau de statistiques dit l'état du match. Un score dit son résultat.
 * Ni l'un ni l'autre ne dit sa NARRATION : qu'il ne s'est rien passé pendant
 * vingt minutes, qu'il y a eu trois frappes en deux minutes, qu'une expulsion
 * a tout changé à la 68e. C'est pourtant ça qu'un commentateur radio donne en
 * premier, et c'était le trou le plus visible du plateau.
 *
 * ── Deux modes, deux questions ──────────────────────────────────────────────
 *
 * `opts.recent` — le bandeau permanent du direct : « qu'est-ce qui vient de se
 * passer ? ». Les derniers faits, sans sélection.
 *
 * Par défaut — l'insert et les scènes d'analyse : « raconte-moi le match ».
 * Les faits qui comptent, dans l'ordre, les corners sacrifiés avant les buts.
 *
 * ── La connexion avec les autres blocs ──────────────────────────────────────
 *
 * Les pastilles sont les MÊMES que sur la carte des tirs : un but est un
 * disque cerclé de blanc ici comme là-bas, un tir contré un anneau creux. Et
 * la distance écrite ici (« dans la surface, dans l'axe ») est calculée depuis
 * la même position que la pastille que la carte vient d'afficher. Le fil ne
 * répète donc pas la carte : il la LÉGENDE.
 */

import {
  derniersFaits,
  detailDuFait,
  estBut,
  type FaitEntry,
  filDuMatch,
  LIBELLE,
  paireCouleurs,
  VALEUR_FIL,
} from '@kz/core';
import { h } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/** Hauteur d'une ligne, gouttière comprise. Mesurée sur le rendu. */
const LIGNE = 46;
/** Ce que mange l'en-tête du panneau. */
const CHROME = 76 + 16;

/**
 * La marque d'un fait. Volontairement dessinée en CSS et pas en icône :
 * l'alphabet visuel est celui de la carte des tirs, et deux blocs qui parlent
 * du même ballon doivent le dessiner pareil.
 */
function marque(kind: FaitEntry['kind']): HTMLElement {
  return h('i', { class: `fil__marque fil__marque--${kind}` });
}

export const fil: WidgetFactory = (ctx): Widget => {
  const recent = ctx.opts.recent === true;
  // Un bandeau large et bas ne tient que quatre lignes sur une colonne. En
  // deux colonnes il en tient huit, et huit faits racontent une mi-temps là
  // où quatre n'en donnent que la fin.
  const large = ctx.opts.large === true;
  const box = panel({
    icon: 'live',
    kicker: recent ? 'En direct' : 'Depuis le coup d’envoi',
    title: recent ? 'Derniers faits' : 'Le fil du match',
  });

  const liste = h('div', { class: large ? 'fil fil--deux' : 'fil' });
  // Le vide est un état comme un autre : un panneau qui n'affiche rien
  // ressemble à une panne, alors qu'un match peut vraiment n'avoir rien
  // produit pendant dix minutes.
  const vide = h('p', { class: 'fil__vide t-caption' }, ['Aucun fait de jeu pour l’instant']);
  box.body.append(liste, vide);

  let signature: string | null = null;
  /** Le dernier fait montré en tête, pour n'animer que ce qui est NOUVEAU. */
  let tete: number | null = null;

  return {
    el: box.el,

    update({ state, box: slot }: WidgetContext) {
      // La capacité vient du créneau, pas d'une constante : le même widget
      // sert un bandeau de trois lignes et une colonne de douze.
      const parColonne = slot.h > 0 ? Math.max(2, Math.floor((slot.h - CHROME) / LIGNE)) : 8;
      const capacite = large ? parColonne * 2 : parColonne;
      const faits = recent
        ? derniersFaits(state.feed, capacite)
        : filDuMatch(state.feed, capacite);

      // Le plus récent EN HAUT. Un fil qui pousse vers le bas déplace la ligne
      // importante à chaque fait : l'œil doit la rechercher, alors qu'en haut
      // elle est toujours au même endroit.
      const ordre = [...faits].reverse();

      const cellule = large ? slot.w / 2 : slot.w;
      const next = `${capacite}|${Math.round(cellule)}|${state.meta?.id ?? ''}|${ordre.map((f) => `${f.seq}:${f.kind}:${f.x ?? ''}`).join(',')}`;
      if (next === signature) return;
      signature = next;

      vide.hidden = ordre.length > 0;
      liste.replaceChildren();
      // La grille a besoin du nombre de rangées pour remplir la première
      // colonne avant d'attaquer la seconde. Le dire en CSS seul demanderait
      // un nombre fixe, qui ne survivrait pas au changement de créneau.
      if (large) liste.style.setProperty('--lignes', String(Math.ceil(ordre.length / 2)));

      const meta = state.meta;
      // La même paire que la carte des tirs : une frappe porte la même couleur
      // dans les deux blocs, et deux maillots rouge sombre ne produisent pas
      // deux liserés identiques.
      const teintes = paireCouleurs(meta?.home, meta?.away);
      for (const fait of ordre) {
        const equipe = fait.side === 'home' ? meta?.home : meta?.away;

        const crest = crestEl('fil__crest');
        paintCrest(crest, equipe);

        const titre = h('span', { class: 'fil__quoi' }, [LIBELLE[fait.kind]]);
        const haut = h('div', { class: 'fil__haut' }, [
          h('span', { class: 'fil__minute' }, [`${fait.minute}'`]),
          crest,
          marque(fait.kind),
          titre,
        ]);

        // Le score n'est inscrit que sur les buts : c'est là qu'il change, et
        // le répéter partout reviendrait à redessiner la bannière de score
        // dans chaque ligne.
        if (fait.score) {
          haut.append(h('span', { class: 'fil__score' }, [`${fait.score[0]}–${fait.score[1]}`]));
        }

        // La largeur réelle d'une cellule décide de la longueur du détail :
        // en deux colonnes dans un bandeau, ou dans une colonne latérale, la
        // forme longue finit en « dans l'a… », et une vérité coupée vaut
        // moins qu'une vérité plus courte.
        const detail = detailDuFait(fait, cellule < 520);
        const ligne = h('div', { class: 'fil__ligne' }, [haut]);
        if (detail) ligne.append(h('div', { class: 'fil__detail t-caption' }, [detail]));

        ligne.dataset.valeur = String(VALEUR_FIL[fait.kind]);
        ligne.dataset.cote = fait.side;
        if (estBut(fait.kind)) ligne.dataset.but = '1';
        ligne.style.setProperty(
          '--teinte',
          fait.side === 'home' ? teintes.home : teintes.away,
        );

        // L'entrée n'est animée que pour un fait réellement nouveau. Sans ce
        // garde-fou, le moindre changement de capacité — une scène qui
        // s'ouvre — rejouerait l'animation sur toute la liste, et un plateau
        // qui frissonne entier se remarque immédiatement à l'antenne.
        if (ordre[0] === fait && tete !== null && fait.seq !== tete) ligne.dataset.neuf = '1';

        liste.append(ligne);
      }

      tete = ordre[0]?.seq ?? null;

      // Dire qu'on en montre une partie, plutôt que de laisser croire que le
      // match n'a produit que les huit faits visibles.
      const total = state.feed.length;
      if (!recent) {
        box.setHead(
          'Depuis le coup d’envoi',
          total > ordre.length ? `Le fil — ${ordre.length} de ${total}` : 'Le fil du match',
        );
      }
    },
  };
};
