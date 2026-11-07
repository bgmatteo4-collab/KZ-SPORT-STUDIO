/**
 * La grammaire du mouvement : sa part CALCULABLE.
 *
 * Même partage que pour les ressorts — ce qui ne touche pas au DOM vit ici,
 * se teste sous Node, et sert aussi bien à l'antenne qu'à la régie. La couche
 * qui écrit vraiment dans la page est `apps/overlay/src/mouvement.ts`, et
 * c'est elle qui documente l'intention d'ensemble.
 */

/** Les trois courbes. Trois, comme les rayons et les espacements. */
export const COURBE = {
  /** Ce qui arrive : longue décélération, pas de rebond. */
  entree: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /** Ce qui part : on accélère vers la sortie. */
  sortie: 'cubic-bezier(0.55, 0, 1, 0.45)',
  /** Ce qui reste et se déplace : ni départ ni arrivée à souligner. */
  glisse: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const;

/** Les durées, en millisecondes. Le code en a besoin, pas seulement le CSS. */
export const DUREE = {
  sortie: 220,
  entree: 520,
  glisse: 460,
  /** Le chevauchement : le nouveau part quand l'ancien est déjà loin. */
  retard: 140,
  /** L'écart entre deux lignes d'une même liste. */
  echelon: 26,
  /** Au-delà, l'échelonnement devient une attente. */
  echelonMax: 220,
} as const;

export type Direction = 'gauche' | 'droite' | 'haut' | 'bas';

/** Un créneau du plateau, en coordonnées normalisées (0 à 1). */
export interface Creneau {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Par où un créneau entre, d'après la place qu'il occupe sur le plateau.
 *
 * Règle n°3 du mouvement : ON ENTRE PAR OÙ L'ON VIT. Tout faire monter de
 * vingt pixels — ce que faisait l'habillage — revient à n'avoir aucune
 * direction : la scène n'a pas de géographie, et le regard ne sait pas où se
 * poser. La direction se DÉDUIT du créneau, donc aucun widget n'a à la
 * déclarer, et aucun ne peut l'oublier.
 */
export function directionDuCreneau(slot: Creneau): Direction {
  const gauche = slot.x;
  const droite = 1 - (slot.x + slot.w);
  const haut = slot.y;
  const bas = 1 - (slot.y + slot.h);

  // Une bande qui traverse tout l'écran n'a pas de bord latéral : ses deux
  // écarts horizontaux valent zéro, et prendre le plus petit des quatre la
  // ferait entrer par la gauche. Elle appartient au bord dont elle est
  // vraiment proche, en haut ou en bas.
  if (slot.w >= 0.8) return haut <= bas ? 'haut' : 'bas';
  if (slot.h >= 0.8) return gauche <= droite ? 'gauche' : 'droite';

  const min = Math.min(gauche, droite, haut, bas);
  // Les côtés l'emportent à égalité : l'œil lit d'abord en largeur.
  if (min === gauche) return 'gauche';
  if (min === droite) return 'droite';
  return min === haut ? 'haut' : 'bas';
}

/**
 * Deux créneaux occupent-ils la même place à l'écran ?
 *
 * Pas « sont-ils égaux » : le panneau de statistiques vit en x = 0,008 et le
 * multiplex qui le remplace en x = 0,012. Comparer les quatre nombres disait
 * donc que ces deux-là n'avaient rien à voir, et les laissait se croiser à
 * mi-opacité au même endroit de l'écran — précisément la bouillie que la règle
 * du chevauchement existe pour éviter. Ce qui compte est ce que le spectateur
 * voit : la surface commune.
 */
export function memeEndroit(a: Creneau, b: Creneau): boolean {
  const largeur = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const hauteur = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const commune = largeur * hauteur;
  const plusPetit = Math.min(a.w * a.h, b.w * b.h);
  return plusPetit > 0 && commune / plusPetit >= 0.5;
}
