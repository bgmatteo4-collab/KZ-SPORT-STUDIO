/**
 * La liaison avec le serveur.
 *
 * Trois propriétés non négociables :
 *
 *  1. ELLE SE RECONNECTE TOUTE SEULE. Une coupure réseau ne doit pas vider
 *     l'antenne : l'overlay continue d'afficher son dernier état et reprend
 *     la timeline par `resume` dès que le lien revient.
 *
 *  2. ELLE CALE L'HORLOGE. Un navigateur mal réglé afficherait le match décalé
 *     de plusieurs secondes sans que personne ne comprenne pourquoi.
 *
 *  3. ELLE SIGNALE LES SAUTS. Après un rechargement ou un changement de délai,
 *     tout le passé entre d'un coup dans le champ visible ; il faut alors
 *     réarmer les déclenchements sans rien rejouer à l'antenne.
 */

import {
  ClockSync,
  DEFAULT_CONTROL,
  StateCursor,
  type ClientMessage,
  type ControlState,
  type ProviderStatus,
  type ServerMessage,
} from '@kz/core';

export class Connection {
  readonly cursor = new StateCursor();
  readonly sync = new ClockSync();

  control: ControlState = { ...DEFAULT_CONTROL };
  provider: ProviderStatus = { name: '…', connected: false, lastEventAt: null };
  connected = false;

  /** Appelé quand le temps a sauté : réarmer les déclenchements, ne rien rejouer. */
  onJump: (() => void) | null = null;
  onControl: ((control: ControlState) => void) | null = null;

  private socket: WebSocket | null = null;
  private retryMs = 500;
  private pingTimer: number | null = null;

  constructor(private readonly url = wsUrl()) {}

  connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.connected = true;
      this.retryMs = 500;
      this.ping();
      // Calage serré au début, puis entretien.
      this.pingTimer = window.setInterval(() => this.ping(), 5_000);
    });

    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      this.handle(message);
    });

    socket.addEventListener('close', () => {
      this.connected = false;
      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      // Repli exponentiel borné : on insiste sans marteler.
      window.setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(5_000, this.retryMs * 2);
    });

    socket.addEventListener('error', () => socket.close());
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'hello': {
        // Reconstruction complète. C'est le chemin du rechargement : toute la
        // timeline arrive d'un coup et l'overlay redevient juste immédiatement.
        this.cursor.replace(message.events);
        this.applyControl(message.control);
        this.provider = message.provider;
        this.onJump?.();
        break;
      }
      case 'events': {
        const added = this.cursor.ingest(message.events);
        if (added > 0) this.send({ type: 'resume', sinceSeq: this.cursor.lastSeq });
        break;
      }
      case 'control': {
        const delayChanged = message.control.delayMs !== this.control.delayMs;
        this.applyControl(message.control);
        // Changer le délai fait sauter le temps affiché : on réarme.
        if (delayChanged) this.onJump?.();
        break;
      }
      case 'provider': {
        this.provider = message.provider;
        break;
      }
      case 'pong': {
        this.sync.sample(message.clientSent, message.serverTime, Date.now());
        break;
      }
      case 'reload': {
        window.location.reload();
        break;
      }
    }
  }

  private applyControl(control: ControlState): void {
    this.control = control;
    this.sync.setScale(control.timeScale);
    this.onControl?.(control);
  }

  private ping(): void {
    this.send({ type: 'ping', sent: Date.now() });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /** L'instant à rendre : le temps du serveur, moins le décalage anti-spoiler. */
  renderTime(): number {
    return this.sync.now() - this.control.delayMs;
  }
}

function wsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}
