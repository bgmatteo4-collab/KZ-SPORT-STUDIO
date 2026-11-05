/**
 * La mémoire de la régie.
 *
 * Sans ça, un redémarrage du serveur en pleine seconde mi-temps ramène le
 * décalage anti-spoiler, la scène et l'habillage à leurs valeurs par défaut.
 * C'est un incident d'antenne, et il arrive exactement au pire moment : quand
 * on relance parce que quelque chose cloche déjà.
 *
 * Un fichier JSON suffit. Pas de base de données pour trois champs, et un
 * fichier se lit, se corrige et se supprime à la main en cas de besoin — ce
 * qui compte à vingt heures cinquante-cinq.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ControlState } from '@kz/core';

/** Ce qu'on garde. La vitesse de rejeu, non : elle est propre à une séance. */
type Persistable = Pick<ControlState, 'delayMs' | 'sceneId' | 'themeId' | 'camMode'>;

const CHAMPS: (keyof Persistable)[] = ['delayMs', 'sceneId', 'themeId', 'camMode'];

export class ControlStore {
  private readonly chemin: string;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  private dernier = '';

  constructor(chemin = process.env.KZ_STATE ?? '.kz/control.json') {
    this.chemin = resolve(process.cwd(), chemin);
  }

  /**
   * Ce qui a été retenu de la dernière séance, ou rien.
   * Un fichier absent, illisible ou corrompu n'est pas une erreur : on repart
   * des valeurs par défaut plutôt que d'empêcher le serveur de démarrer.
   */
  read(): Partial<ControlState> {
    try {
      const brut = JSON.parse(readFileSync(this.chemin, 'utf8')) as Record<string, unknown>;
      const garde: Partial<ControlState> = {};
      if (typeof brut.delayMs === 'number' && Number.isFinite(brut.delayMs)) {
        garde.delayMs = Math.min(300_000, Math.max(0, brut.delayMs));
      }
      if (typeof brut.sceneId === 'string') garde.sceneId = brut.sceneId;
      if (typeof brut.themeId === 'string') garde.themeId = brut.themeId;
      if (brut.camMode === 'obs' || brut.camMode === 'browser') garde.camMode = brut.camMode;
      return garde;
    } catch {
      return {};
    }
  }

  /**
   * Enregistre, au plus une fois par seconde.
   *
   * L'opérateur fait glisser le curseur de délai : cent commandes en deux
   * secondes. Écrire à chaque fois userait le disque pour rien, et une écriture
   * interrompue au mauvais moment laisserait un fichier tronqué — d'où le
   * passage par un fichier temporaire renommé, qui est atomique.
   */
  write(control: ControlState): void {
    const garde: Persistable = {
      delayMs: control.delayMs,
      sceneId: control.sceneId,
      themeId: control.themeId,
      camMode: control.camMode,
    };
    const texte = JSON.stringify(garde, CHAMPS as string[], 2);
    if (texte === this.dernier) return;
    this.dernier = texte;

    if (this.minuterie) return;
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      this.flush();
    }, 1_000);
    this.minuterie.unref?.();
  }

  /** Écrit tout de suite. Appelé à l'arrêt, pour ne rien perdre. */
  flush(): void {
    if (!this.dernier) return;
    try {
      mkdirSync(dirname(this.chemin), { recursive: true });
      const temporaire = `${this.chemin}.tmp`;
      writeFileSync(temporaire, `${this.dernier}\n`);
      renameSync(temporaire, this.chemin);
    } catch (erreur) {
      // Ne jamais couper l'antenne pour un problème d'écriture : on le signale
      // et on continue avec l'état en mémoire.
      console.warn(
        `[kz] état non enregistré (${this.chemin}) :`,
        erreur instanceof Error ? erreur.message : erreur,
      );
    }
  }

  get path(): string {
    return this.chemin;
  }
}
