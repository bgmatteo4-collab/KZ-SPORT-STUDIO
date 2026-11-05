/**
 * Le pilotage d'OBS.
 *
 * C'est la pièce qui fait que la caméra bouge VRAIMENT. Jusqu'ici, le bouton
 * « OBS » de la régie ne faisait rien d'utile : il disait seulement à l'overlay
 * de ne pas dessiner la caméra. Rien ne parlait à OBS.
 *
 * Ici, la régie se connecte au greffon obs-websocket (protocole v5, livré avec
 * OBS depuis la version 28) et envoie la transformation de la source caméra à
 * chaque changement de scène. OBS anime alors TA vraie webcam — avec tes
 * filtres, ta correction couleur, ta netteté — à la position que la scène
 * déclare.
 *
 * ── Pourquoi la régie et pas le serveur ──────────────────────────────────────
 *
 * OBS tourne sur TA machine. Le serveur, lui, peut être ailleurs — sur un VPS,
 * dans un conteneur. La régie, elle, est forcément ouverte sur la machine qui
 * diffuse : c'est le seul endroit d'où `localhost:4455` désigne le bon OBS.
 */

import type { Rect } from '@kz/core';

/** Le plateau fait toujours cette taille ; OBS travaille dans la même toile. */
const CANVAS = { w: 1920, h: 1080 };

export type ObsStatut =
  | { etat: 'eteint' }
  | { etat: 'connexion' }
  | { etat: 'pret'; scene: string; source: string }
  | { etat: 'erreur'; message: string };

export interface ObsReglages {
  adresse: string;
  motDePasse: string;
  /** La scène OBS qui contient la caméra. */
  scene: string;
  /** Le nom de la source caméra dans cette scène. */
  source: string;
}

export const REGLAGES_PAR_DEFAUT: ObsReglages = {
  adresse: 'ws://127.0.0.1:4455',
  motDePasse: '',
  scene: '',
  source: '',
};

interface Attente {
  resoudre: (données: Record<string, unknown>) => void;
  rejeter: (erreur: Error) => void;
}

export class ObsLink {
  private socket: WebSocket | null = null;
  private attentes = new Map<string, Attente>();
  private compteur = 0;
  private reglages: ObsReglages = { ...REGLAGES_PAR_DEFAUT };
  private itemId: number | null = null;
  private tailleSource: { w: number; h: number } | null = null;
  private dernierRect = '';
  private vivant = false;

  onStatut: ((statut: ObsStatut) => void) | null = null;

  get connecte(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.itemId !== null;
  }

  async connecter(reglages: ObsReglages): Promise<void> {
    this.deconnecter();
    this.reglages = { ...reglages };
    this.vivant = true;
    this.statut({ etat: 'connexion' });

    let socket: WebSocket;
    try {
      socket = new WebSocket(reglages.adresse);
    } catch (erreur) {
      this.statut({ etat: 'erreur', message: `adresse invalide : ${String(erreur)}` });
      return;
    }
    this.socket = socket;

    socket.addEventListener('message', (evenement) => {
      void this.recevoir(String(evenement.data));
    });

    socket.addEventListener('close', () => {
      this.itemId = null;
      this.tailleSource = null;
      if (this.vivant) {
        this.statut({ etat: 'erreur', message: 'lien coupé — OBS est-il ouvert ?' });
      } else {
        this.statut({ etat: 'eteint' });
      }
    });

    socket.addEventListener('error', () => {
      this.statut({
        etat: 'erreur',
        message: "OBS injoignable. Outils → Paramètres du serveur WebSocket → activer.",
      });
    });
  }

  deconnecter(): void {
    this.vivant = false;
    this.itemId = null;
    this.tailleSource = null;
    this.dernierRect = '';
    for (const attente of this.attentes.values()) {
      attente.rejeter(new Error('lien fermé'));
    }
    this.attentes.clear();
    this.socket?.close();
    this.socket = null;
  }

  /**
   * Place la caméra dans le rectangle que la scène déclare.
   *
   * OBS n'a pas de notion de transition : on lui donne la position finale, et
   * c'est lui qui affiche. L'animation vient de l'overlay, qui déplace son
   * cadre sur la même durée — à l'œil, les deux bougent ensemble.
   */
  async placerCamera(rect: Rect | null): Promise<void> {
    if (!this.connecte || this.itemId === null) return;

    // Caméra masquée : on la retire de l'affichage plutôt que de la déplacer
    // hors champ, pour qu'OBS cesse d'en payer le rendu.
    if (!rect) {
      await this.requete('SetSceneItemEnabled', {
        sceneName: this.reglages.scene,
        sceneItemId: this.itemId,
        sceneItemEnabled: false,
      }).catch(() => undefined);
      this.dernierRect = 'masquee';
      return;
    }

    const empreinte = `${rect.x},${rect.y},${rect.w},${rect.h}`;
    if (empreinte === this.dernierRect) return;
    this.dernierRect = empreinte;

    const taille = await this.mesurerSource();
    if (!taille) return;

    const largeur = rect.w * CANVAS.w;
    const hauteur = rect.h * CANVAS.h;

    // On remplit le créneau sans déformer : la caméra est recadrée, pas étirée.
    // Un visage étiré se voit immédiatement, un recadrage non.
    const echelle = Math.max(largeur / taille.w, hauteur / taille.h);
    const rendue = { w: taille.w * echelle, h: taille.h * echelle };

    await this.requete('SetSceneItemEnabled', {
      sceneName: this.reglages.scene,
      sceneItemId: this.itemId,
      sceneItemEnabled: true,
    }).catch(() => undefined);

    await this.requete('SetSceneItemTransform', {
      sceneName: this.reglages.scene,
      sceneItemId: this.itemId,
      sceneItemTransform: {
        positionX: rect.x * CANVAS.w,
        positionY: rect.y * CANVAS.h,
        scaleX: echelle,
        scaleY: echelle,
        // Le débord est rogné pour tenir dans le créneau exact.
        cropLeft: Math.round((rendue.w - largeur) / 2 / echelle),
        cropRight: Math.round((rendue.w - largeur) / 2 / echelle),
        cropTop: Math.round((rendue.h - hauteur) / 2 / echelle),
        cropBottom: Math.round((rendue.h - hauteur) / 2 / echelle),
        alignment: 5, // haut-gauche : la position est le coin du créneau
      },
    }).catch((erreur: Error) => {
      this.statut({ etat: 'erreur', message: erreur.message });
    });
  }

  // ─────────────────────────────── Protocole ──────────────────────────────────

  private statut(s: ObsStatut): void {
    this.onStatut?.(s);
  }

  private async recevoir(brut: string): Promise<void> {
    let message: { op: number; d: Record<string, unknown> };
    try {
      message = JSON.parse(brut) as { op: number; d: Record<string, unknown> };
    } catch {
      return;
    }

    // op 0 : Hello. OBS annonce s'il demande une authentification.
    if (message.op === 0) {
      const auth = message.d.authentication as { challenge: string; salt: string } | undefined;
      const identification: Record<string, unknown> = { rpcVersion: 1 };
      if (auth) {
        identification.authentication = await this.signature(auth.salt, auth.challenge);
      }
      this.envoyer({ op: 1, d: identification });
      return;
    }

    // op 2 : Identified. Le lien est établi, on peut résoudre la caméra.
    if (message.op === 2) {
      await this.resoudreSource();
      return;
    }

    // op 7 : réponse à une requête.
    if (message.op === 7) {
      const id = message.d.requestId as string;
      const attente = this.attentes.get(id);
      if (!attente) return;
      this.attentes.delete(id);
      const statut = message.d.requestStatus as { result: boolean; comment?: string } | undefined;
      if (statut?.result) {
        attente.resoudre((message.d.responseData as Record<string, unknown>) ?? {});
      } else {
        attente.rejeter(new Error(statut?.comment ?? 'requête refusée par OBS'));
      }
    }
  }

  /** base64(sha256(base64(sha256(motDePasse + sel)) + défi)) — protocole v5. */
  private async signature(sel: string, defi: string): Promise<string> {
    const sha = async (texte: string): Promise<string> => {
      const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
      return btoa(String.fromCharCode(...new Uint8Array(octets)));
    };
    return sha((await sha(this.reglages.motDePasse + sel)) + defi);
  }

  private envoyer(message: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private requete(type: string, donnees: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resoudre, rejeter) => {
      const id = `kz-${this.compteur++}`;
      this.attentes.set(id, { resoudre, rejeter });
      this.envoyer({ op: 6, d: { requestType: type, requestId: id, requestData: donnees } });
      // Une requête sans réponse ne doit pas fuir indéfiniment.
      window.setTimeout(() => {
        if (this.attentes.delete(id)) rejeter(new Error(`OBS n'a pas répondu à ${type}`));
      }, 5_000);
    });
  }

  /** Trouve l'identifiant de la source caméra dans sa scène. */
  private async resoudreSource(): Promise<void> {
    const { scene, source } = this.reglages;
    if (!scene || !source) {
      this.statut({ etat: 'erreur', message: 'scène et source à renseigner' });
      return;
    }
    try {
      const reponse = await this.requete('GetSceneItemId', {
        sceneName: scene,
        sourceName: source,
      });
      this.itemId = reponse.sceneItemId as number;
      this.tailleSource = null;
      this.dernierRect = '';
      this.statut({ etat: 'pret', scene, source });
    } catch (erreur) {
      this.itemId = null;
      this.statut({
        etat: 'erreur',
        message: erreur instanceof Error ? erreur.message : 'source introuvable',
      });
    }
  }

  /** La taille native de la caméra, mesurée une fois puis gardée. */
  private async mesurerSource(): Promise<{ w: number; h: number } | null> {
    if (this.tailleSource) return this.tailleSource;
    if (this.itemId === null) return null;
    try {
      const reponse = await this.requete('GetSceneItemTransform', {
        sceneName: this.reglages.scene,
        sceneItemId: this.itemId,
      });
      const t = reponse.sceneItemTransform as { sourceWidth: number; sourceHeight: number };
      if (!t?.sourceWidth || !t?.sourceHeight) return null;
      this.tailleSource = { w: t.sourceWidth, h: t.sourceHeight };
      return this.tailleSource;
    } catch {
      return null;
    }
  }
}
