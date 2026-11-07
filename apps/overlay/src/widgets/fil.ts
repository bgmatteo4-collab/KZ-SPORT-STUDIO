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
import { listeAnimee, type EntreeListe } from '../mouvement.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/**
 * Hauteur d'une ligne, gouttière comprise. Mesurées sur le rendu réel.
 *
 * Deux valeurs, parce qu'il y a deux formes de ligne : sur deux rangées —
 * le fait, puis son détail en dessous — pour le fil complet, et sur UNE
 * rangée pour le bandeau permanent. Se tromper ici ne déborde pas, c'est
 * pire : le conteneur comprime les lignes et rogne le détail par le bas,
 * ce qui ressemble à une police mal choisie plutôt qu'à un défaut de calcul.
 */
const LIGNE_DEUX_RANGEES = 56;
const LIGNE_UNE_RANGEE = 36;
/** Ce que mangent l'en-tête du panneau et les marges de la liste. */
const CHROME = 76 + 24;

/**
 * ── Le panneau TOURNE ──────────────────────────────────────────────────────
 *
 * Le bandeau permanent tient deux lignes. Un match en produit quarante. On
 * montrait donc les deux dernières, indéfiniment : passé la dixième minute,
 * le bloc le plus présent à l'écran était aussi le plus immobile, et ce qui
 * s'était passé entre-temps n'existait nulle part.
 *
 * Il feuillette maintenant. Trois pages au plus — remonter plus loin que ça
 * n'est plus « ce qui vient de se passer », c'est le fil du match, et c'est
 * l'autre mode de ce widget.
 *
 * La rotation se mesure sur le temps RÉEL et non sur le chrono, pour la même
 * raison que le rouleau des buteurs : en rejeu à vingt fois la vitesse, un
 * compte en temps de match ferait tourner les pages vingt fois trop vite.
 * La lisibilité, elle, se mesure en secondes d'horloge murale.
 */
const TOUR_FAITS_MS = 5_600;
const PAGES_MAX = 3;

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

  // Combien de pages, et laquelle. Dans l'en-tête, à droite : sans ce repère,
  // un fil qui change tout seul ressemble à un panneau qui perd ses lignes.
  const points = h('i', { class: 'fil__points' });
  box.el.querySelector('.panel__aside')?.append(points);

  /*
   * Le fil pousse par le HAUT : un fait arrive, tous les autres descendent
   * d'un cran, et le dernier sort par le bas.
   *
   * Avant, seule la ligne de tête portait une animation d'entrée, et le reste
   * de la liste SAUTAIT d'une rangée sous elle. L'œil voyait donc deux choses
   * contradictoires — une ligne qui se pose doucement, et une colonne qui se
   * téléporte. Les lignes sont maintenant suivies par leur numéro de séquence :
   * celles qui restent glissent jusqu'à leur nouvelle rangée, et le mouvement
   * de descente se lit comme un fil qui défile.
   */
  const defile = listeAnimee(liste);

  let signature: string | null = null;
  /** La page affichée, et quand elle cède la place. */
  let page = 0;
  let prochain = 0;
  /** Le fait le plus récent déjà vu, pour revenir en tête quand il en arrive un. */
  let tete: number | null = null;

  return {
    el: box.el,

    update({ state, box: slot, realNow }: WidgetContext) {
      // La capacité vient du créneau, pas d'une constante : le même widget
      // sert un bandeau de trois lignes et une colonne de douze.
      const ligne = recent ? LIGNE_UNE_RANGEE : LIGNE_DEUX_RANGEES;
      const parColonne = slot.h > 0 ? Math.max(1, Math.floor((slot.h - CHROME) / ligne)) : 8;
      const capacite = large ? parColonne * 2 : parColonne;
      // On en demande de quoi remplir plusieurs pages, pas seulement l'écran.
      const reserve = capacite * PAGES_MAX;
      const faits = recent
        ? derniersFaits(state.feed, reserve)
        : filDuMatch(state.feed, reserve);

      // Le plus récent EN HAUT. Un fil qui pousse vers le bas déplace la ligne
      // importante à chaque fait : l'œil doit la rechercher, alors qu'en haut
      // elle est toujours au même endroit.
      const tout = [...faits].reverse();
      const nbPages = Math.max(1, Math.min(PAGES_MAX, Math.ceil(tout.length / capacite)));

      // Un fait vient d'arriver : RETOUR EN TÊTE, immédiatement. Laisser la
      // rotation finir son tour pendant qu'un but est annoncé ailleurs sur le
      // plateau serait le seul moment où ce panneau a vraiment quelque chose
      // à dire, et où il parlerait d'autre chose.
      const sommet = tout[0]?.seq ?? null;
      if (sommet !== tete) {
        tete = sommet;
        page = 0;
        prochain = realNow + TOUR_FAITS_MS;
      } else if (nbPages <= 1) {
        page = 0;
        prochain = 0;
      } else if (prochain === 0) {
        prochain = realNow + TOUR_FAITS_MS;
      } else if (realNow >= prochain) {
        prochain = realNow + TOUR_FAITS_MS;
        page = (page + 1) % nbPages;
      }
      if (page >= nbPages) page = 0;

      const ordre = tout.slice(page * capacite, page * capacite + capacite);

      const cellule = large ? slot.w / 2 : slot.w;
      const next = `${capacite}|${Math.round(cellule)}|${state.meta?.id ?? ''}|${page}/${nbPages}|${ordre.map((f) => `${f.seq}:${f.kind}:${f.x ?? ''}`).join(',')}`;
      if (next === signature) return;
      signature = next;

      vide.hidden = ordre.length > 0;

      // Les points ne s'affichent que s'il y a vraiment plusieurs pages :
      // un seul point sous un panneau laisserait croire à du contenu caché.
      points.replaceChildren();
      if (nbPages > 1) {
        for (let i = 0; i < nbPages; i += 1) {
          const p = h('u');
          if (i === page) p.dataset.on = '1';
          points.append(p);
        }
      }
      // La grille a besoin du nombre de rangées pour remplir la première
      // colonne avant d'attaquer la seconde. Le dire en CSS seul demanderait
      // un nombre fixe, qui ne survivrait pas au changement de créneau.
      if (large) liste.style.setProperty('--lignes', String(Math.ceil(ordre.length / 2)));

      const meta = state.meta;
      // La même paire que la carte des tirs : une frappe porte la même couleur
      // dans les deux blocs, et deux maillots rouge sombre ne produisent pas
      // deux liserés identiques.
      const teintes = paireCouleurs(meta?.home, meta?.away);

      const construire = (fait: (typeof ordre)[number]): HTMLElement => {
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
        const rangee = h('div', { class: 'fil__ligne' }, [haut]);
        if (detail) {
          // Sur un bandeau étroit, le détail passe SUR LA MÊME rangée, après
          // le libellé : deux rangées y seraient comprimées par le conteneur
          // et la seconde se retrouverait rognée par le bas.
          if (recent) {
            titre.after(h('span', { class: 'fil__detail fil__detail--meme-ligne' }, [detail]));
          } else {
            rangee.append(h('div', { class: 'fil__detail t-caption' }, [detail]));
          }
        }

        rangee.dataset.valeur = String(VALEUR_FIL[fait.kind]);
        rangee.dataset.cote = fait.side;
        if (estBut(fait.kind)) rangee.dataset.but = '1';
        rangee.style.setProperty('--teinte', fait.side === 'home' ? teintes.home : teintes.away);
        return rangee;
      };

      // La clé est le numéro de séquence du fait : il ne change jamais, même
      // quand la ligne est redessinée plus courte parce que le créneau a
      // rétréci. C'est ce qui distingue « la même ligne, ailleurs » de « une
      // autre ligne » — toute l'animation en dépend.
      const entrees: EntreeListe[] = ordre.map((fait) => ({
        cle: String(fait.seq),
        faire: () => construire(fait),
      }));
      defile.rendre(entrees);

      // Pas de « 10 de 53 » dans le titre : c'est une information de régie,
      // pas d'antenne. Le spectateur n'a aucune idée de ce qu'est un « fait »
      // pour nous, et lui dire qu'il en manque quarante-trois n'ajoute rien
      // à ce qu'il regarde.
    },
  };
};
