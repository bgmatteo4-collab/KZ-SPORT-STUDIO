/**
 * L'interface des sources de données.
 *
 * Tout ce qui alimente la timeline passe par là : Sportmonks, le simulateur,
 * et plus tard une saisie manuelle en régie. Rien dans le rendu ne connaît le
 * nom d'un fournisseur — c'est ce qui permettra d'en changer sans tout casser.
 */

import type { MatchEvent, ProviderStatus } from '@kz/core';

/** Le serveur donne ça au fournisseur : l'heure du match, à la bonne vitesse. */
export interface Clock {
  now(): number;
  readonly scale: number;
}

export type EventSink = (events: MatchEvent[]) => void;

export interface Provider {
  readonly name: string;
  start(sink: EventSink, clock: Clock): Promise<void>;
  stop(): Promise<void>;
  status(): ProviderStatus;
}
