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
 * qu'une émission tourne, et une régie qui exige un rechargement pour en
 * tenir compte n'en tient pas compte.
 */
export function mouvementReduit(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Anime quelque chose tant que le ressort n'est pas au repos.
 *
 * Rend une fonction « viser » : on lui donne la nouvelle cible, elle relance
 * la boucle si besoin. Aucune boucle ne tourne quand rien ne bouge — une
 * régie ouverte toute une soirée ne doit pas consommer une image sur deux à
 * animer des choses immobiles.
 */
export function anime(
  depart: number,
  reglage: ReglageRessort,
  dessiner: (valeur: number) => void,
): (cible: number) => void {
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

  dessiner(ressort.valeur);

  return (cible: number): void => {
    if (mouvementReduit()) {
      ressort.poser(cible);
      dessiner(cible);
      return;
    }
    ressort.viser(cible);
    if (!actif) {
      actif = true;
      requestAnimationFrame(image);
    }
  };
}
