/**
 * La couche qui anime : elle touche le DOM, donc elle reste ici.
 *
 * La physique, elle, vit dans `@kz/core` — partagée avec l'habillage, et
 * testée sous Node parce qu'elle ne dépend de rien.
 */

import { Ressort, type ReglageRessort } from '@kz/core';

export { MOUVEMENTS, Ressort, type ReglageRessort } from '@kz/core';

/**
 * Le mouvement est-il refusé par le système ?
 *
 * Lu à chaque appel plutôt que mémorisé : le réglage peut changer pendant
 * qu'une émission tourne, et une interface qui exige un rechargement pour en
 * tenir compte n'en tient pas compte.
 */
export function mouvementReduit(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Animation {
  /** Nouvelle cible, sans casser le mouvement en cours. */
  (cible: number): void;
  /**
   * Rejoue depuis le début, d'un coup.
   *
   * ── Pourquoi ça ne peut pas être deux appels ──────────────────────────
   *
   * La version précédente faisait `viser(0)` puis, à l'image suivante,
   * `viser(1)`. Deux appels, donc deux cibles successives — et à l'antenne la
   * vague de but est partie À L'ENVERS : quelque chose avait redéclenché le
   * premier appel pendant que le second jouait, et le ressort obéissait à la
   * dernière consigne reçue. Vu une fois sur un vrai but, impossible à
   * reproduire à la demande.
   *
   * Une relance pose la position ET la cible dans le même tour : il n'y a
   * plus de fenêtre où l'une peut arriver sans l'autre.
   */
  relancer(depuis: number, vers: number): void;
}

/**
 * Anime quelque chose tant que le ressort n'est pas au repos.
 *
 * Aucune boucle ne tourne quand rien ne bouge — une page ouverte toute une
 * soirée ne doit pas consommer une image sur deux à animer des choses
 * immobiles.
 */
export function anime(
  depart: number,
  reglage: ReglageRessort,
  dessiner: (valeur: number) => void,
): Animation {
  const ressort = new Ressort(depart, reglage);
  let actif = false;
  let precedent = 0;

  const image = (maintenant: number): void => {
    const dt = precedent === 0 ? 16 : maintenant - precedent;
    precedent = maintenant;
    dessiner(ressort.avance(dt));
    if (ressort.repos) {
      actif = false;
      precedent = 0;
      return;
    }
    requestAnimationFrame(image);
  };

  const lancer = (): void => {
    if (actif) return;
    actif = true;
    requestAnimationFrame(image);
  };

  dessiner(ressort.valeur);

  const viser = ((cible: number): void => {
    if (mouvementReduit()) {
      ressort.poser(cible);
      dessiner(cible);
      return;
    }
    ressort.viser(cible);
    lancer();
  }) as Animation;

  viser.relancer = (depuis: number, vers: number): void => {
    if (mouvementReduit()) {
      ressort.poser(vers);
      dessiner(vers);
      return;
    }
    ressort.poser(depuis);
    dessiner(depuis);
    ressort.viser(vers);
    lancer();
  };

  return viser;
}
