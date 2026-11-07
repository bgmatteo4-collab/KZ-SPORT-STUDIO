/**
 * Le MOUVEMENT de l'antenne : une grammaire, pas une collection d'effets.
 *
 * ── Ce qui n'allait pas ─────────────────────────────────────────────────────
 *
 * Chaque panneau avait son petit effet local, et le reste SAUTAIT. Un insert
 * remplaçait les statistiques d'une image à l'autre ; le multiplex reclassait
 * ses vingt lignes d'un coup ; le fil du match réécrivait sa liste entière.
 * Pris un par un, aucun de ces sauts n'est grave ; mis bout à bout pendant
 * quatre-vingt-dix minutes, ils donnent exactement l'impression que l'habillage
 * est une page web qu'on rafraîchit, pas un plateau de télévision.
 *
 * ── Les trois règles ────────────────────────────────────────────────────────
 *
 * 1. CE QUI ARRIVE DÉCÉLÈRE, CE QUI PART ACCÉLÈRE. L'œil suit ce qui entre ;
 *    il ne regarde pas ce qui sort. Une entrée dure donc longtemps et finit
 *    doucement ; une sortie est brève et s'en va vite. Les deux courbes ne sont
 *    pas la même courbe, et c'est ce déséquilibre qui fait « appareil » plutôt
 *    que « transition CSS ».
 *
 * 2. LA SORTIE PASSE DEVANT. Quand un panneau en remplace un autre dans le
 *    même créneau, les faire se croiser à égalité donne une bouillie de deux
 *    images superposées. L'ancien part D'ABORD, le nouveau entre APRÈS, avec
 *    un chevauchement court. C'est le `--retard` de la règle d'entrée.
 *
 * 3. ON ENTRE PAR OÙ L'ON VIT. Un panneau de la colonne de gauche arrive par
 *    la gauche, la bannière du haut par le haut, le bandeau du bas par le bas.
 *    Tout faire monter de vingt pixels, c'était n'avoir aucune direction : la
 *    scène n'a pas de géographie, et le regard ne sait pas où se poser.
 *
 * ── Et les listes ───────────────────────────────────────────────────────────
 *
 * `listeAnimee` est la pièce la moins visible et la plus importante. Une liste
 * d'antenne se RECLASSE : au multiplex, le match qui vient de marquer remonte
 * en tête. Reconstruire la liste fait disparaître et réapparaître vingt
 * lignes pour en déplacer une, et personne ne voit ce qui s'est passé. Ici les
 * lignes sont suivies par clé : celles qui restent GLISSENT jusqu'à leur
 * nouvelle place, celles qui arrivent entrent, celles qui partent sortent. Le
 * déplacement devient lisible — c'est tout le propos.
 */

import { COURBE, DUREE, type Direction } from '@kz/core';
import { mouvementReduit } from './ressort.js';

// La géométrie et les constantes vivent dans `@kz/core` : elles ne touchent
// pas au DOM, donc elles se testent sous Node. Même partage que les ressorts.
export {
  COURBE,
  DUREE,
  type Creneau,
  type Direction,
  directionDuCreneau,
  memeEndroit,
} from '@kz/core';

/** Le vecteur d'entrée d'une direction, en pixels. */
const VECTEUR: Record<Direction, [number, number]> = {
  gauche: [-34, 0],
  droite: [34, 0],
  haut: [0, -28],
  bas: [0, 28],
};

/**
 * Prépare une couche : sa direction d'entrée et son retard.
 *
 * Les valeurs sont posées en propriétés personnalisées pour que la feuille de
 * style garde la main sur la mise en forme. Le JavaScript dit D'OÙ et QUAND,
 * le CSS dit COMMENT.
 */
export function orienter(host: HTMLElement, direction: Direction, retard = 0): void {
  const [dx, dy] = VECTEUR[direction];
  host.style.setProperty('--vx', `${dx}px`);
  host.style.setProperty('--vy', `${dy}px`);
  host.style.setProperty('--retard', `${retard}ms`);
}

// ─────────────────────────────── Les listes ──────────────────────────────────

export interface EntreeListe {
  /**
   * L'identité de la ligne À TRAVERS les mises à jour. Deux rendus successifs
   * qui portent la même clé parlent de la même ligne, même si son contenu a
   * entièrement changé — c'est ce qui permet de la faire glisser plutôt que de
   * la détruire.
   */
  cle: string;
  /** Construit la ligne. Appelé à chaque rendu : garder la fonction pure. */
  faire(): HTMLElement;
}

export interface ListeAnimee {
  rendre(entrees: readonly EntreeListe[]): void;
}

interface Place {
  x: number;
  y: number;
  w: number;
  h: number;
}

function placer(el: HTMLElement): Place {
  // `offsetLeft` et non `getBoundingClientRect` : le plateau entier porte un
  // `scale()` pour tenir dans une fenêtre de prévisualisation, et un rectangle
  // écran serait donc exprimé dans une autre échelle que le `translate` qu'on
  // va écrire. Les décalages de mise en page, eux, ignorent les transformées
  // des ancêtres.
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * Une liste qui glisse.
 *
 * Technique dite FLIP : on relève la position AVANT, on pose la nouvelle liste,
 * on relève la position APRÈS, et on repart de l'ancienne place pour revenir à
 * la nouvelle. Le navigateur n'anime jamais une mise en page — il anime une
 * transformée, qui ne coûte rien au compositeur. C'est la seule façon de faire
 * bouger vingt lignes dans OBS sans perdre d'images.
 */
export function listeAnimee(conteneur: HTMLElement): ListeAnimee {
  conteneur.classList.add('anim-liste');
  let vues = new Map<string, HTMLElement>();

  return {
    rendre(entrees) {
      const neuf = new Map<string, HTMLElement>();
      for (const e of entrees) neuf.set(e.cle, e.faire());

      if (mouvementReduit() || vues.size === 0) {
        conteneur.replaceChildren(...neuf.values());
        vues = neuf;
        return;
      }

      // ── AVANT ──
      const avant = new Map<string, Place>();
      for (const [cle, el] of vues) {
        if (el.isConnected) avant.set(cle, placer(el));
      }

      // ── Les partantes, figées à leur place avant de disparaître ──
      const fantomes: HTMLElement[] = [];
      for (const [cle, el] of vues) {
        if (neuf.has(cle) || !el.isConnected) continue;
        const p = avant.get(cle);
        if (!p) continue;
        el.classList.add('anim-part');
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
        el.style.width = `${p.w}px`;
        el.style.height = `${p.h}px`;
        fantomes.push(el);
      }

      conteneur.replaceChildren(...neuf.values(), ...fantomes);

      // ── APRÈS ──
      let rang = 0;
      const glissants: { el: HTMLElement; dx: number; dy: number }[] = [];
      const entrants: HTMLElement[] = [];
      for (const [cle, el] of neuf) {
        const p = avant.get(cle);
        if (!p) {
          el.classList.add('anim-entre');
          el.style.setProperty(
            '--retard',
            `${Math.min(DUREE.echelonMax, rang * DUREE.echelon) + DUREE.retard}ms`,
          );
          entrants.push(el);
          rang += 1;
          continue;
        }
        const apres = placer(el);
        const dx = p.x - apres.x;
        const dy = p.y - apres.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) glissants.push({ el, dx, dy });
      }

      // Poser le point de départ sans transition, puis le relâcher à l'image
      // suivante. Les deux doivent être séparés par un calcul de style, sinon
      // le navigateur ne voit qu'une seule valeur et n'anime rien.
      for (const g of glissants) {
        g.el.style.transition = 'none';
        g.el.style.transform = `translate3d(${g.dx}px, ${g.dy}px, 0)`;
      }
      if (glissants.length > 0 || entrants.length > 0) void conteneur.offsetHeight;
      for (const g of glissants) {
        g.el.style.transition = `transform ${DUREE.glisse}ms ${COURBE.glisse}`;
        g.el.style.transform = 'translate3d(0, 0, 0)';
      }
      for (const el of entrants) el.classList.add('anim-entre--go');

      for (const el of fantomes) {
        el.classList.add('anim-part--go');
        window.setTimeout(() => el.remove(), DUREE.sortie + 40);
      }

      vues = neuf;
    },
  };
}
