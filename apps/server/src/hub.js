/**
 * Le hub : la timeline autoritaire et la diffusion vers les pages.
 *
 * Règle n°1 du projet : le serveur fait autorité. Les pages envoient des
 * intentions (« passe à la scène radar », « mets 32 secondes de délai »), jamais
 * un état. C'est ce qui garantit que l'overlay et la régie ne peuvent pas
 * diverger.
 */
import { DEFAULT_CONTROL, findScene, findTheme, } from '@kz/core';
export class Hub {
    clock;
    broadcast;
    events = [];
    seen = new Set();
    control;
    provider = {
        name: 'aucun',
        connected: false,
        lastEventAt: null,
    };
    /** Appelé à chaque changement de l'état de contrôle, pour l'enregistrer. */
    onControlChange = null;
    constructor(clock, broadcast, initialControl = {}) {
        this.clock = clock;
        this.broadcast = broadcast;
        this.control = { ...DEFAULT_CONTROL, ...initialControl, timeScale: clock.scale };
    }
    /** Point d'entrée des fournisseurs. Idempotent par `seq`. */
    ingest(incoming) {
        const fresh = [];
        for (const event of incoming) {
            if (this.seen.has(event.seq))
                continue;
            this.seen.add(event.seq);
            this.events.push(event);
            fresh.push(event);
        }
        if (fresh.length === 0)
            return;
        this.events.sort((a, b) => a.t - b.t || a.seq - b.seq);
        this.broadcast({ type: 'events', events: fresh });
    }
    setProviderStatus(status) {
        const changed = status.connected !== this.provider.connected ||
            status.detail !== this.provider.detail ||
            status.name !== this.provider.name;
        this.provider = status;
        if (changed)
            this.broadcast({ type: 'provider', provider: status });
    }
    /** Le message d'accueil : toute la timeline, pour que la page se reconstruise seule. */
    hello() {
        return {
            type: 'hello',
            serverTime: this.clock.now(),
            events: this.events,
            control: this.control,
            provider: this.provider,
        };
    }
    eventsSince(seq) {
        return this.events.filter((e) => e.seq > seq);
    }
    get controlState() {
        return this.control;
    }
    get timelineSize() {
        return this.events.length;
    }
    get providerStatus() {
        return this.provider;
    }
    /**
     * Applique une commande. Renvoie `true` si quelque chose a changé.
     * Toute valeur est bornée ici : une régie ne doit pas pouvoir mettre
     * l'antenne dans un état impossible.
     */
    apply(command) {
        const before = this.control;
        switch (command.name) {
            case 'set-delay': {
                this.control = { ...this.control, delayMs: clampDelay(command.delayMs) };
                break;
            }
            case 'nudge-delay': {
                this.control = {
                    ...this.control,
                    delayMs: clampDelay(this.control.delayMs + command.deltaMs),
                };
                break;
            }
            case 'set-scene': {
                this.control = { ...this.control, sceneId: findScene(command.sceneId).id };
                break;
            }
            case 'set-theme': {
                this.control = { ...this.control, themeId: findTheme(command.themeId).id };
                break;
            }
            case 'set-cam-mode': {
                this.control = { ...this.control, camMode: command.camMode };
                break;
            }
            case 'set-insert-mode': {
                this.control = { ...this.control, insertMode: command.insertMode };
                break;
            }
            case 'force-insert': {
                // Imposer un insert implique de vouloir des inserts.
                this.control = {
                    ...this.control,
                    insertForce: command.insertId,
                    insertMode: command.insertId ? 'auto' : this.control.insertMode,
                };
                break;
            }
            case 'replay-speed': {
                const speed = Math.min(60, Math.max(0.25, command.speed));
                this.clock.setScale(speed);
                this.control = { ...this.control, timeScale: this.clock.scale };
                break;
            }
            case 'replay-seek': {
                // Traité par le fournisseur, pas ici.
                return false;
            }
        }
        if (shallowEqual(before, this.control))
            return false;
        this.broadcast({ type: 'control', control: this.control });
        this.onControlChange?.(this.control);
        return true;
    }
}
/** De 0 à 5 minutes. Au-delà, c'est une erreur de saisie, pas une intention. */
function clampDelay(ms) {
    return Math.min(300_000, Math.max(0, Math.round(ms)));
}
function shallowEqual(a, b) {
    return Object.keys(a).every((k) => a[k] === b[k]);
}
