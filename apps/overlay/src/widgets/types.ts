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
  /** L'instant rendu, en temps serveur. */
  now: number;
  /** Position de la caméra sur la scène courante, si elle est visible. */
  cam: { x: number; y: number; w: number; h: number; style: string } | null;
}

export interface Widget {
  readonly el: HTMLElement;
  /** Appelé à chaque image. Doit être bon marché : voir `setText`. */
  update(ctx: WidgetContext): void;
  /** Déclenchements ponctuels (but, carton). Optionnel. */
  trigger?(trigger: Trigger, ctx: WidgetContext): void;
  destroy?(): void;
}

export type WidgetFactory = (ctx: WidgetContext) => Widget;
