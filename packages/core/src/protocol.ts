/**
 * Le protocole entre le serveur et les pages.
 *
 * Deux principes :
 *   • Le serveur fait autorité (règle n°1). L'overlay n'envoie que des intentions.
 *   • Tout message d'état porte des `seq`, donc une coupure réseau se répare
 *     par `resume` sans tout retélécharger.
 */

import type { MatchEvent } from './types.js';

export interface ControlState {
  /** Le décalage anti-spoiler, en ms. La valeur qui rattrape ton stream. */
  delayMs: number;
  sceneId: string;
  themeId: string;
  /** `obs` : on pilote la webcam dans OBS. `browser` : l'overlay la capture. */
  camMode: 'obs' | 'browser';
  live: boolean;
  /**
   * Vitesse d'écoulement du temps du match. 1 en direct.
   * En rejeu accéléré, le client DOIT la connaître : sans ça son horloge
   * avance à 1x pendant que les événements arrivent à 20x, et tout se décale.
   */
  timeScale: number;
}

export interface ProviderStatus {
  name: string;
  connected: boolean;
  lastEventAt: number | null;
  detail?: string;
}

export type ServerMessage =
  | {
      type: 'hello';
      serverTime: number;
      /** Toute la timeline connue : l'overlay peut se reconstruire seul. */
      events: MatchEvent[];
      control: ControlState;
      provider: ProviderStatus;
    }
  | { type: 'events'; events: MatchEvent[] }
  | { type: 'control'; control: ControlState }
  | { type: 'provider'; provider: ProviderStatus }
  | { type: 'pong'; clientSent: number; serverTime: number }
  | { type: 'reload' };

export type ClientMessage =
  | { type: 'ping'; sent: number }
  | { type: 'resume'; sinceSeq: number }
  | { type: 'command'; command: Command };

export type Command =
  | { name: 'set-delay'; delayMs: number }
  | { name: 'nudge-delay'; deltaMs: number }
  | { name: 'set-scene'; sceneId: string }
  | { name: 'set-theme'; themeId: string }
  | { name: 'set-cam-mode'; camMode: 'obs' | 'browser' }
  | { name: 'replay-seek'; matchMs: number }
  | { name: 'replay-speed'; speed: number };

export const DEFAULT_CONTROL: ControlState = {
  delayMs: 30_000,
  sceneId: 'match',
  themeId: 'kztv',
  camMode: 'browser',
  live: false,
  timeScale: 1,
};
