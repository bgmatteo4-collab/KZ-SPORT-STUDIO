/**
 * Le contrat d'un widget.
 *
 * Règle n°6 : tout widget doit survivre à l'absence de données. Pas de donnée
 * = pas d'affichage, jamais un `undefined` à l'antenne.
 */

import type { MatchState, Theme, Trigger } from '@kz/core';

export interface WidgetContext {
  state: MatchState;
  /** Chrono LISSÉ, en ms. Toujours préférer ça à `state.clockMs` pour afficher. */
  clockMs: number;
  theme: Theme;
  opts: Record<string, unknown>;
  /** Taille du créneau, en pixels du plateau 1920×1080. */
  box: { w: number; h: number };
  /**
   * L'instant rendu, en temps du MATCH. Sert à lire l'état, et lui seul.
   * En rejeu accéléré il avance vingt fois plus vite que la montre.
   */
  now: number;
  /**
   * Le temps RÉEL, en millisecondes depuis le chargement.
   *
   * Toute durée d'AFFICHAGE se mesure ici : un carton de but doit rester cinq
   * secondes à l'écran, que le match soit rejoué à vitesse normale ou à x20.
   * Mesurée sur `now`, elle durerait un quart de seconde en accéléré — et
   * changerait sous les doigts de l'opérateur dès qu'il touche à la vitesse.
   */
  realNow: number;
  // ATTENTION : `realNow` est un compteur depuis l'ouverture de la page, pas
  // une date. Il sert à MESURER DES DURÉES — combien de temps un carton reste
  // à l'écran — et uniquement à ça. Le comparer à un instant du match, comme
  // une heure de coup d'envoi, donne des absurdités : on a vu un compte à
  // rebours annoncer « 498281 h ». Pour un instant, c'est `now` qu'il faut.
  /** Position de la caméra sur la scène courante, si elle est visible. */
  cam: { x: number; y: number; w: number; h: number; style: string } | null;
}

export interface Widget {
  readonly el: HTMLElement;
  /**
   * Ce widget DESSINE-t-il ? Un canevas — radar, courbe de momentum — doit être
   * repeint à chaque image. Tout le reste affiche des valeurs discrètes et n'a
   * rien à faire soixante fois par seconde : le moteur ne l'appelle alors que
   * lorsque l'état a bougé. Dans OBS, où chaque source navigateur est une
   * instance de Chromium, cette distinction vaut des images par seconde.
   */
  readonly animated?: boolean;
  /** Appelé selon le budget ci-dessus. Doit rester bon marché : voir `setText`. */
  update(ctx: WidgetContext): void;
  /** Déclenchements ponctuels (but, carton). Optionnel. */
  trigger?(trigger: Trigger, ctx: WidgetContext): void;
  destroy?(): void;
}

export type WidgetFactory = (ctx: WidgetContext) => Widget;
