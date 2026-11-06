/**
 * Le serveur temps réel de KZ Studio.
 *
 *   • WebSocket  /ws        — timeline et contrôle, vers l'overlay et la régie
 *   • REST       /api/...   — commandes, dont des URL simples pour le Stream Deck
 *
 * Il ne sert pas les pages : en développement c'est Vite qui s'en charge et qui
 * proxifie /api et /ws vers ici.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  findScene,
  rectToPixels,
  SCENE_MODES,
  SCENES,
  THEMES,
  type ClientMessage,
  type Command,
  type SceneMode,
  type ServerMessage,
} from '@kz/core';
import {
  chargerEnv,
  espn,
  EspnProvider,
  SimulatorProvider,
  SportmonksProvider,
  type Provider,
} from '@kz/providers';
import { ServerClock } from './clock.js';
import { Hub } from './hub.js';
import { ControlStore } from './persist.js';

// AVANT toute lecture de `process.env`, sans quoi tout ce qui suit lit des
// valeurs par défaut. Node ne charge pas `.env` de lui-même, et l'oublier ne
// provoque aucune erreur : le serveur démarre simplement sur le simulateur
// pendant qu'on cherche pourquoi le vrai match n'arrive pas.
const charges = chargerEnv();

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

/** Un fournisseur ESPN réglé comme on les veut ici. Une seule définition. */
function creerEspn(ligue: string, eventId: string | null): EspnProvider {
  return new EspnProvider({
    ligue,
    // Sans match désigné, le fournisseur prend le premier en cours : c'est ce
    // qu'on veut neuf fois sur dix en lançant pendant une soirée.
    ...(eventId ? { eventId } : {}),
    avecMultiplex: process.env.KZ_MULTIPLEX !== '0',
    // Enregistrer pendant qu'on diffuse ne coûte rien et sauve la soirée
    // suivante : chaque match réel devient une fixture rejouable.
    ...(process.env.KZ_RECORD ? { recordTo: process.env.KZ_RECORD } : {}),
  });
}

if (PROVIDER_NAME === 'sportmonks') {
  const token = process.env.SPORTMONKS_TOKEN;
  const fixtureId = Number(process.env.SPORTMONKS_FIXTURE_ID ?? 0);
  if (!fixtureId) {
    console.error('✗ KZ_PROVIDER=sportmonks exige SPORTMONKS_FIXTURE_ID dans .env');
    process.exit(1);
  }
  if (!token) {
    // Pas d'erreur : un mandataire réseau peut injecter l'en-tête
    // `Authorization` à notre place, ce qui évite d'écrire le jeton quelque part.
    console.log('  jeton       : absent du .env — on compte sur l’en-tête injectée');
  }
  provider = new SportmonksProvider({
    fixtureId,
    ...(token ? { token } : {}),
    withBall: process.env.KZ_BALL !== '0',
    // Enregistrer pendant qu'on diffuse ne coûte rien et sauve la soirée
    // suivante : chaque match réel devient une fixture rejouable.
    ...(process.env.KZ_RECORD ? { recordTo: process.env.KZ_RECORD } : {}),
  });
} else if (PROVIDER_NAME === 'espn') {
  // ESPN ne demande aucun jeton. C'est le seul fournisseur avec lequel on peut
  // diffuser la Ligue des Champions et la Ligue 1 aujourd'hui — le palier
  // gratuit de Sportmonks n'ouvre que quatre championnats, aucun des nôtres.
  //
  // Le match retenu : d'abord ce que dit l'environnement, sinon CELUI QU'ON
  // DIFFUSAIT. Relancer le serveur en pleine soirée doit reprendre le match en
  // cours, pas retomber sur une variable posée la veille.
  const repris = retenu.source;
  const ligue = process.env.ESPN_LEAGUE ?? repris?.league ?? 'uefa.champions';
  const eventId = process.env.ESPN_EVENT_ID ?? repris?.eventId ?? null;
  console.log(
    `  championnat : ${ligue}${eventId ? ` · match ${eventId}` : ' · premier match en cours'}`,
  );
  provider = creerEspn(ligue, eventId);
  hub.apply({
    name: 'set-source',
    source: { provider: 'espn', league: ligue, eventId, label: repris?.label ?? null },
  });
} else {
  simulator = new SimulatorProvider({ fixturePath: FIXTURE, startAtMs: START_AT });
  provider = simulator;
  hub.apply({
    name: 'set-source',
    source: { provider: 'simulator', league: null, eventId: null, label: FIXTURE },
  });
}

await provider.start((events) => hub.ingest(events), clock);

/**
 * Changer de match SANS redémarrer.
 *
 * Trois choses doivent se passer dans cet ordre, et aucune n'est facultative :
 * arrêter l'ancien fournisseur (sinon deux sources nourrissent la même
 * timeline), VIDER la timeline (sinon le match précédent reste à l'écran et
 * les `seq` du nouveau passent pour des doublons), et demander aux pages de se
 * reconstruire.
 *
 * Le verrou n'est pas de la précaution gratuite : deux clics rapides en régie
 * lanceraient deux bascules entrelacées, et c'est la timeline qui trinquerait.
 */
// ───────────────────────── Les écussons, mis en cache ────────────────────────
//
// Les logos viennent du CDN d'ESPN : 59 Ko pièce, et une centaine pour ouvrir
// le sélecteur. Deux raisons de les garder ici, et la seconde est la vraie :
//
//   • le menu s'ouvre instantanément la deuxième fois ;
//   • surtout, l'overlay cesse de dépendre d'un tiers EN PLEINE ÉMISSION. Un
//     hoquet du CDN d'ESPN ferait disparaître tous les écussons à l'antenne.
//     Une fois le fichier ici, il y reste.
//
// La liste d'hôtes n'est pas une formalité : sans elle, cette route serait un
// mandataire ouvert, et n'importe qui sur le réseau pourrait faire sortir des
// requêtes par notre serveur.
const ECU_HOTES = new Set(['a.espncdn.com']);
const ECU_DIR = resolve(process.cwd(), '.kz/ecussons');
const ecusEnMemoire = new Map<string, Buffer>();

async function servirEcu(brut: string | null, res: ServerResponse): Promise<void> {
  let cible: URL;
  try {
    cible = new URL(brut ?? '');
  } catch {
    json(res, 400, { error: 'adresse invalide' });
    return;
  }
  if (cible.protocol !== 'https:' || !ECU_HOTES.has(cible.hostname)) {
    json(res, 403, { error: `hôte non autorisé : ${cible.hostname}` });
    return;
  }

  const cle = createHash('sha1').update(cible.href).digest('hex');
  const chemin = resolve(ECU_DIR, `${cle}.png`);

  const envoyer = (buffer: Buffer): void => {
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': String(buffer.byteLength),
      // Une semaine : un club ne change pas d'écusson en cours de saison.
      'cache-control': 'public, max-age=604800, immutable',
    });
    res.end(buffer);
  };

  const enMemoire = ecusEnMemoire.get(cle);
  if (enMemoire) {
    envoyer(enMemoire);
    return;
  }
  if (existsSync(chemin)) {
    const buffer = readFileSync(chemin);
    ecusEnMemoire.set(cle, buffer);
    envoyer(buffer);
    return;
  }

  try {
    const r = await fetch(cible, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) throw new Error(`CDN ${r.status}`);
    const buffer = Buffer.from(await r.arrayBuffer());
    mkdirSync(ECU_DIR, { recursive: true });
    writeFileSync(chemin, buffer);
    ecusEnMemoire.set(cle, buffer);
    envoyer(buffer);
  } catch (erreur) {
    // 404 plutôt qu'une erreur : côté page, l'image se retire et l'écu dessiné
    // reparaît. Un logo manquant ne doit jamais faire un trou à l'antenne.
    json(res, 404, { error: erreur instanceof Error ? erreur.message : String(erreur) });
  }
}

// ───────────────── Les emblèmes de compétition, remplaçables ─────────────────
//
// ESPN date ses emblèmes de mai 2019 et ne les a jamais remis à jour : son
// logo de Ligue 1 est encore l'ancien, en gris. On ne peut pas corriger ESPN,
// mais on peut laisser l'utilisateur imposer le bon — il dépose un fichier
// nommé d'après le code de la compétition dans `assets/competitions/`, et il
// prime. Sans fichier, on retombe sur celui du fournisseur.
const EMBLEME_DIR = resolve(process.cwd(), 'assets/competitions');
const EMBLEME_TYPES: [string, string][] = [
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
];

function servirEmbleme(slug: string, repli: string | null, res: ServerResponse): void {
  // Cette valeur devient un chemin de fichier : on n'accepte que la forme d'un
  // code de compétition, et jamais de quoi remonter dans l'arborescence.
  if (!/^[a-z0-9._-]{1,64}$/i.test(slug) || slug.includes('..')) {
    json(res, 400, { error: 'code de compétition invalide' });
    return;
  }

  for (const [ext, type] of EMBLEME_TYPES) {
    const chemin = resolve(EMBLEME_DIR, `${slug}${ext}`);
    if (!existsSync(chemin)) continue;
    const buffer = readFileSync(chemin);
    res.writeHead(200, {
      'content-type': type,
      'content-length': String(buffer.byteLength),
      // Court : on veut qu'un fichier remplacé se voie au rechargement suivant,
      // pas une heure plus tard en pleine émission.
      'cache-control': 'public, max-age=60',
    });
    res.end(buffer);
    return;
  }

  void servirEcu(repli, res);
}

/** Clé de cache pour « tous les championnats ». */
const TOUT = '*';
const CACHE_MS = 15_000;
const cacheMatchs = new Map<string, { at: number; liste: espn.MatchListe[] }>();

async function listeCachee(cle: string): Promise<espn.MatchListe[]> {
  const vu = cacheMatchs.get(cle);
  if (vu && Date.now() - vu.at < CACHE_MS) return vu.liste;
  const liste = cle === TOUT ? await espn.toutLeJour() : await espn.matchsDuJour(cle);
  cacheMatchs.set(cle, { at: Date.now(), liste });
  return liste;
}

let basculeEnCours = false;

async function basculerVers(ligue: string, eventId: string, label: string | null): Promise<void> {
  if (basculeEnCours) throw new Error('une bascule est déjà en cours');
  basculeEnCours = true;
  try {
    await provider.stop();
    hub.reset();
    simulator = null;
    hub.apply({
      name: 'set-source',
      source: { provider: 'espn', league: ligue, eventId, label },
    });
    provider = creerEspn(ligue, eventId);
    await provider.start((events) => hub.ingest(events), clock);
    hub.setProviderStatus(provider.status());
    hub.demanderRechargement();
    console.log(`↻ bascule sur ${label ?? eventId} (${ligue})`);
  } finally {
    basculeEnCours = false;
  }
}

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
  if (head === 'mode' && a) return { name: 'set-scene-mode', mode: a as SceneMode };
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
      scenes: SCENES.map((s) => ({ id: s.id, name: s.name, aDesModes: Boolean(s.modes) })),
      modes: SCENE_MODES,
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

  if (parts[0] === 'ecu') {
    void servirEcu(url.searchParams.get('u'), res);
    return;
  }

  if (parts[0] === 'embleme' && parts.length === 2) {
    servirEmbleme(parts[1]!, url.searchParams.get('de'), res);
    return;
  }

  // ── Le sélecteur de match ──────────────────────────────────────────────────
  //
  // La liste est MISE EN CACHE quinze secondes. La régie l'interroge en boucle
  // pendant qu'une émission tourne, et rien ne justifie de taper neuf fois sur
  // ESPN à chaque rafraîchissement d'un menu que personne ne regarde.
  if (parts[0] === 'matchs' || parts[0] === 'matches') {
    const ligue = url.searchParams.get('ligue') ?? url.searchParams.get('league');
    void (async () => {
      try {
        const matchs = ligue ? await listeCachee(ligue) : await listeCachee(TOUT);
        // Les filtres se construisent sur ce qui EXISTE ce soir, pas sur une
        // liste figée : c'est ainsi qu'on finissait par « ne pas trouver tous
        // les matchs en direct ».
        const vues = new Map<string, string>();
        for (const m of matchs) if (m.ligue) vues.set(m.ligue, m.ligueNom);
        json(res, 200, {
          ligues: [...vues]
            .map(([id, nom]) => ({ id, nom }))
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
          matchs,
          source: hub.controlState.source,
        });
      } catch (erreur) {
        // ESPN qui bronche ne doit pas faire tomber la régie : elle garde son
        // dernier menu et réessaiera.
        json(res, 502, { error: erreur instanceof Error ? erreur.message : String(erreur) });
      }
    })();
    return;
  }

  if (parts[0] === 'match' && parts.length === 3) {
    const ligue = parts[1]!;
    const eventId = parts[2]!;
    void (async () => {
      try {
        await basculerVers(ligue, eventId, url.searchParams.get('label'));
        json(res, 200, { ok: true, control: hub.controlState });
      } catch (erreur) {
        json(res, 409, { error: erreur instanceof Error ? erreur.message : String(erreur) });
      }
    })();
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
  // Dire ce qui a été lu dans `.env` : si le fichier est ignoré, ça se voit
  // tout de suite au lieu de se déduire d'un match de démonstration inattendu.
  console.log(`  .env        : ${charges.length > 0 ? charges.join(', ') : 'aucun fichier lu'}`);
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
