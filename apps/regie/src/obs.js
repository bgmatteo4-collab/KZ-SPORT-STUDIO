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
/** Le plateau fait toujours cette taille ; OBS travaille dans la même toile. */
const CANVAS = { w: 1920, h: 1080 };
export const REGLAGES_PAR_DEFAUT = {
    adresse: 'ws://127.0.0.1:4455',
    motDePasse: '',
    scene: '',
    source: '',
};
export class ObsLink {
    socket = null;
    attentes = new Map();
    compteur = 0;
    reglages = { ...REGLAGES_PAR_DEFAUT };
    itemId = null;
    tailleSource = null;
    dernierRect = '';
    vivant = false;
    onStatut = null;
    get connecte() {
        return this.socket?.readyState === WebSocket.OPEN && this.itemId !== null;
    }
    async connecter(reglages) {
        this.deconnecter();
        this.reglages = { ...reglages };
        this.vivant = true;
        this.statut({ etat: 'connexion' });
        let socket;
        try {
            socket = new WebSocket(reglages.adresse);
        }
        catch (erreur) {
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
            }
            else {
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
    deconnecter() {
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
    async placerCamera(rect) {
        if (!this.connecte || this.itemId === null)
            return;
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
        if (empreinte === this.dernierRect)
            return;
        this.dernierRect = empreinte;
        const taille = await this.mesurerSource();
        if (!taille)
            return;
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
        }).catch((erreur) => {
            this.statut({ etat: 'erreur', message: erreur.message });
        });
    }
    // ─────────────────────────────── Protocole ──────────────────────────────────
    statut(s) {
        this.onStatut?.(s);
    }
    async recevoir(brut) {
        let message;
        try {
            message = JSON.parse(brut);
        }
        catch {
            return;
        }
        // op 0 : Hello. OBS annonce s'il demande une authentification.
        if (message.op === 0) {
            const auth = message.d.authentication;
            const identification = { rpcVersion: 1 };
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
            const id = message.d.requestId;
            const attente = this.attentes.get(id);
            if (!attente)
                return;
            this.attentes.delete(id);
            const statut = message.d.requestStatus;
            if (statut?.result) {
                attente.resoudre(message.d.responseData ?? {});
            }
            else {
                attente.rejeter(new Error(statut?.comment ?? 'requête refusée par OBS'));
            }
        }
    }
    /** base64(sha256(base64(sha256(motDePasse + sel)) + défi)) — protocole v5. */
    async signature(sel, defi) {
        const sha = async (texte) => {
            const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
            return btoa(String.fromCharCode(...new Uint8Array(octets)));
        };
        return sha((await sha(this.reglages.motDePasse + sel)) + defi);
    }
    envoyer(message) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }
    requete(type, donnees) {
        return new Promise((resoudre, rejeter) => {
            const id = `kz-${this.compteur++}`;
            this.attentes.set(id, { resoudre, rejeter });
            this.envoyer({ op: 6, d: { requestType: type, requestId: id, requestData: donnees } });
            // Une requête sans réponse ne doit pas fuir indéfiniment.
            window.setTimeout(() => {
                if (this.attentes.delete(id))
                    rejeter(new Error(`OBS n'a pas répondu à ${type}`));
            }, 5_000);
        });
    }
    /** Trouve l'identifiant de la source caméra dans sa scène. */
    async resoudreSource() {
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
            this.itemId = reponse.sceneItemId;
            this.tailleSource = null;
            this.dernierRect = '';
            this.statut({ etat: 'pret', scene, source });
        }
        catch (erreur) {
            this.itemId = null;
            this.statut({
                etat: 'erreur',
                message: erreur instanceof Error ? erreur.message : 'source introuvable',
            });
        }
    }
    /** La taille native de la caméra, mesurée une fois puis gardée. */
    async mesurerSource() {
        if (this.tailleSource)
            return this.tailleSource;
        if (this.itemId === null)
            return null;
        try {
            const reponse = await this.requete('GetSceneItemTransform', {
                sceneName: this.reglages.scene,
                sceneItemId: this.itemId,
            });
            const t = reponse.sceneItemTransform;
            if (!t?.sourceWidth || !t?.sourceHeight)
                return null;
            this.tailleSource = { w: t.sourceWidth, h: t.sourceHeight };
            return this.tailleSource;
        }
        catch {
            return null;
        }
    }
}
