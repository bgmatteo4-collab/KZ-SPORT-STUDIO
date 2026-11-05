/**
 * Le serveur temps réel de KZ Studio.
 *
 *   • WebSocket  /ws        — timeline et contrôle, vers l'overlay et la régie
 *   • REST       /api/...   — commandes, dont des URL simples pour le Stream Deck
 *
 * Il ne sert pas les pages : en développement c'est Vite qui s'en charge et qui
 * proxifie /api et /ws vers ici.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  findScene,
  rectToPixels,
  SCENES,
  THEMES,
  type ClientMessage,
  type Command,
  type ServerMessage,
} from '@kz/core';
import { SimulatorProvider, SportmonksProvider, type Provider } from '@kz/providers';
import { ServerClock } from './clock.js';
import { Hub } from './hub.js';
import { ControlStore } from './persist.js';

const PORT = Number(process.env.KZ_PORT ?? 4100);
const PROVIDER_NAME = process.env.KZ_PROVIDER ?? 'simulator';
const FIXTURE = process.env.KZ_FIXTURE ?? 'fixtures/demo-ucl.json';
const SPEED = Number(process.env.KZ_REPLAY_SPEED ?? 1);
/** Démarre le rejeu avec le match déjà engagé, pour tomber tout de suite dans le vif. */
const START_AT = Number(process.env.KZ_START_AT ?? 20 * 60_000);

const clock = new ServerClock(SPEED);
const clients = new Set<WebSocket>();

function broadcast(message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

// Ce que la régie avait réglé la dernière fois. Un redémarrage en pleine
// seconde mi-temps ne doit pas ramener le décalage anti-spoiler à trente
// secondes sans prévenir.
const store = new ControlStore();
const retenu = store.read();
const hub = new Hub(clock, broadcast, { ...retenu, timeScale: SPEED });
hub.onControlChange = (control) => store.write(control);

// ───────────────────────────────── Fournisseur ────────────────────────────────

let provider: Provider;
let simulator: SimulatorProvider | null = null;

if (PROVIDER_NAME === 'sportmonks') {
  const token = process.env.SPORTMONKS_TOKEN;
  const fixtureId = Number(process.env.SPORTMONKS_FIXTURE_ID ?? 0);
  if (!token || !fixtureId) {
    console.error(
      '✗ KZ_PROVIDER=sportmonks exige SPORTMONKS_TOKEN et SPORTMONKS_FIXTURE_ID dans .env',
    );
    process.exit(1);
  }
  provider = new SportmonksProvider({ token, fixtureId, withBall: true });
} else {
  simulator = new SimulatorProvider({ fixturePath: FIXTURE, startAtMs: START_AT });
  provider = simulator;
}

await provider.start((events) => hub.ingest(events), clock);

// L'état du fournisseur est republié régulièrement : la régie doit voir d'un
// coup d'œil si la source est vivante.
setInterval(() => hub.setProviderStatus(provider.status()), 1_000);

// ─────────────────────────────────── REST ─────────────────────────────────────

function json(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

/**
 * Les URL du Stream Deck. Volontairement triviales : n'importe quel plugin
 * capable de faire un GET suffit, sans protocole exotique.
 *
 *   GET /api/scene/radar-2d
 *   GET /api/delay/32000
 *   GET /api/delay/nudge/-500
 *   GET /api/theme/ucl
 *   GET /api/speed/20
 */
function commandFromPath(parts: string[]): Command | null {
  const [head, a, b] = parts;

  if (head === 'scene' && a) return { name: 'set-scene', sceneId: a };
  if (head === 'theme' && a) return { name: 'set-theme', themeId: a };
  if (head === 'cam' && (a === 'obs' || a === 'browser')) return { name: 'set-cam-mode', camMode: a };
  if (head === 'speed' && a) return { name: 'replay-speed', speed: Number(a) };
  if (head === 'inserts' && (a === 'auto' || a === 'off')) {
    return { name: 'set-insert-mode', insertMode: a };
  }
  if (head === 'insert' && a) return { name: 'force-insert', insertId: a === 'auto' ? null : a };
  if (head === 'delay') {
    if (a === 'nudge' && b) return { name: 'nudge-delay', deltaMs: Number(b) };
    if (a) return { name: 'set-delay', delayMs: Number(a) };
  }
  return null;
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    res.end();
    return;
  }

  if (!url.pathname.startsWith('/api/')) {
    json(res, 404, { error: 'introuvable' });
    return;
  }

  const parts = url.pathname.slice('/api/'.length).split('/').filter(Boolean);

  // Le rectangle de la caméra sur la scène courante, en pixels du plateau.
  // C'est ce que la régie enverra à OBS pour animer ta vraie webcam.
  // `parts.length === 1` est essentiel : sinon `/api/scene/radar-2d`, qui est
  // une COMMANDE Stream Deck, serait avalé ici au lieu de changer de scène.
  if (parts[0] === 'scene' && parts.length === 1) {
    const scene = findScene(hub.controlState.sceneId);
    json(res, 200, {
      id: scene.id,
      name: scene.name,
      camStyle: scene.camStyle,
      transition: scene.transition,
      cam: scene.cam ? rectToPixels(scene.cam) : null,
    });
    return;
  }

  if (parts[0] === 'status') {
    json(res, 200, {
      serverTime: clock.now(),
      timeScale: clock.scale,
      control: hub.controlState,
      provider: hub.providerStatus,
      timeline: hub.timelineSize,
      scenes: SCENES.map((s) => ({ id: s.id, name: s.name })),
      themes: THEMES.map((t) => ({ id: t.id, name: t.name })),
      clients: clients.size,
    });
    return;
  }

  if (parts[0] === 'command' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 8_192) req.destroy();
    });
    req.on('end', () => {
      try {
        const command = JSON.parse(body) as Command;
        const changed = hub.apply(command);
        json(res, 200, { ok: true, changed, control: hub.controlState });
      } catch {
        json(res, 400, { error: 'corps JSON invalide' });
      }
    });
    return;
  }

  const command = commandFromPath(parts);
  if (command) {
    const changed = hub.apply(command);
    json(res, 200, { ok: true, changed, control: hub.controlState });
    return;
  }

  json(res, 404, { error: 'commande inconnue', path: url.pathname });
}

const server = createServer(handleRequest);

// ──────────────────────────────── WebSocket ───────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  clients.add(socket);
  socket.send(JSON.stringify(hub.hello()));

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'ping': {
        // Le calage d'horloge. Sans ça, un navigateur mal réglé affiche le
        // match décalé de plusieurs secondes sans que personne ne comprenne.
        const reply: ServerMessage = {
          type: 'pong',
          clientSent: message.sent,
          serverTime: clock.now(),
        };
        socket.send(JSON.stringify(reply));
        break;
      }
      case 'resume': {
        const events = hub.eventsSince(message.sinceSeq);
        if (events.length > 0) socket.send(JSON.stringify({ type: 'events', events }));
        break;
      }
      case 'command': {
        hub.apply(message.command);
        break;
      }
    }
  });

  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
});

server.listen(PORT, () => {
  console.log(`▶ KZ Studio — serveur sur http://localhost:${PORT}`);
  console.log(`  fournisseur : ${provider.name}`);
  console.log(`  vitesse     : x${clock.scale}`);
  console.log(`  délai       : ${hub.controlState.delayMs} ms${Object.keys(retenu).length ? ' (repris)' : ''}`);
  console.log(`  scène       : ${hub.controlState.sceneId}`);
  console.log(`  overlay     : http://localhost:4000/overlay/?layer=fg`);
  console.log(`  régie       : http://localhost:4000/regie/`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Ne rien perdre de ce que la régie venait de régler.
    store.flush();
    void provider.stop().then(() => {
      server.close();
      process.exit(0);
    });
  });
}
