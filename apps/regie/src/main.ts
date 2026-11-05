/**
 * La régie. Elle n'affiche pas l'habillage : elle le pilote.
 *
 * Règle n°1 : elle envoie des INTENTIONS. Le serveur décide, borne les valeurs
 * et rediffuse l'état à tout le monde. Deux régies ouvertes restent donc
 * toujours d'accord, et l'overlay ne peut pas se désynchroniser d'elles.
 */

import {
  clockLabel,
  findScene,
  SCENES,
  StateCursor,
  THEMES,
  ClockSync,
  DEFAULT_CONTROL,
  type ClientMessage,
  type Command,
  type ControlState,
  type ProviderStatus,
  type ServerMessage,
} from '@kz/core';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const lampLink = el('lamp-link');
const lampSource = el('lamp-source');
const delayInput = el<HTMLInputElement>('delay');
const delayValue = el<HTMLOutputElement>('delay-value');
const scenesBox = el('scenes');
const themesBox = el('themes');
const camBox = el('cam-mode');
const speedBox = el('speed');
const monitor = el('monitor');

const cursor = new StateCursor();
const sync = new ClockSync();
let control: ControlState = { ...DEFAULT_CONTROL };
let provider: ProviderStatus = { name: '…', connected: false, lastEventAt: null };
let socket: WebSocket | null = null;
let connected = false;
/** Le curseur est-il en train d'être manipulé ? Si oui, on ne l'écrase pas. */
let draggingDelay = false;

// ────────────────────────────────── Boutons ───────────────────────────────────

for (const scene of SCENES) {
  const button = document.createElement('button');
  button.textContent = scene.name;
  button.dataset.scene = scene.id;
  button.addEventListener('click', () => send({ name: 'set-scene', sceneId: scene.id }));
  scenesBox.append(button);
}

for (const theme of THEMES) {
  const button = document.createElement('button');
  button.textContent = theme.name;
  button.dataset.theme = theme.id;
  button.addEventListener('click', () => send({ name: 'set-theme', themeId: theme.id }));
  themesBox.append(button);
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-nudge]')) {
  button.addEventListener('click', () =>
    send({ name: 'nudge-delay', deltaMs: Number(button.dataset.nudge) }),
  );
}

for (const button of camBox.querySelectorAll<HTMLButtonElement>('[data-cam]')) {
  button.addEventListener('click', () =>
    send({ name: 'set-cam-mode', camMode: button.dataset.cam as 'obs' | 'browser' }),
  );
}

for (const button of speedBox.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  button.addEventListener('click', () =>
    send({ name: 'replay-speed', speed: Number(button.dataset.speed) }),
  );
}

delayInput.addEventListener('pointerdown', () => {
  draggingDelay = true;
});
delayInput.addEventListener('pointerup', () => {
  draggingDelay = false;
});
delayInput.addEventListener('input', () => {
  const ms = Number(delayInput.value);
  delayValue.textContent = formatDelay(ms);
  send({ name: 'set-delay', delayMs: ms });
});

el('url-fg').textContent = `${location.origin}/overlay/?layer=fg`;
el('url-bg').textContent = `${location.origin}/overlay/?layer=bg`;

// ─────────────────────────────── Connexion ────────────────────────────────────

function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = ws;

  ws.addEventListener('open', () => {
    connected = true;
    ping();
    window.setInterval(ping, 5_000);
  });

  ws.addEventListener('message', (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'hello':
        cursor.replace(message.events);
        applyControl(message.control);
        provider = message.provider;
        break;
      case 'events':
        cursor.ingest(message.events);
        break;
      case 'control':
        applyControl(message.control);
        break;
      case 'provider':
        provider = message.provider;
        break;
      case 'pong':
        sync.sample(message.clientSent, message.serverTime, Date.now());
        break;
    }
  });

  ws.addEventListener('close', () => {
    connected = false;
    window.setTimeout(connect, 1_000);
  });
}

function ping(): void {
  sendRaw({ type: 'ping', sent: Date.now() });
}

function sendRaw(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function send(command: Command): void {
  sendRaw({ type: 'command', command });
}

function applyControl(next: ControlState): void {
  control = next;
  sync.setScale(next.timeScale);

  if (!draggingDelay) {
    delayInput.value = String(next.delayMs);
    delayValue.textContent = formatDelay(next.delayMs);
  }

  mark(scenesBox, 'scene', next.sceneId);
  mark(themesBox, 'theme', next.themeId);
  mark(camBox, 'cam', next.camMode);
  mark(speedBox, 'speed', String(next.timeScale));
}

function mark(box: HTMLElement, attribute: string, value: string): void {
  for (const button of box.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`)) {
    button.dataset.on = button.dataset[attribute] === value ? '1' : '0';
  }
}

function formatDelay(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

// ──────────────────────────────── Moniteur ────────────────────────────────────

function refresh(): void {
  lampLink.dataset.on = connected ? '1' : '0';
  lampSource.dataset.on = provider.connected ? '1' : '0';

  const renderTime = sync.now() - control.delayMs;
  const state = cursor.at(renderTime);
  const label = clockLabel(state.clockMs, state.phase, state.clock.addedMinutes);
  const scene = findScene(control.sceneId);

  const lines = [
    state.meta
      ? `${state.meta.home.short}  ${state.score[0]} – ${state.score[1]}  ${state.meta.away.short}`
      : 'aucun match',
    state.meta ? `${state.meta.competition}` : '',
    '',
    `chrono d'antenne   ${label.main}${label.added ?? ''}   (${state.phase})`,
    `scène              ${scene.name}   caméra ${scene.cam ? 'visible' : 'masquée'}`,
    `décalage           ${formatDelay(control.delayMs)}`,
    `vitesse            x${control.timeScale}`,
    `source             ${provider.name}${provider.detail ? `  —  ${provider.detail}` : ''}`,
    `timeline           ${cursor.size} événements   seq ${state.lastSeq}`,
    `écart d'horloge    ${sync.currentOffset.toFixed(0)} ms  (${sync.samples} mesures)`,
    '',
    `pression           ${state.meta?.home.abbr ?? 'DOM'} ${state.pressure.home.toFixed(1)}  /  ${state.pressure.away.toFixed(1)} ${state.meta?.away.abbr ?? 'EXT'}`,
    `ballon             x ${state.ball.x.toFixed(2)}   y ${state.ball.y.toFixed(2)}   ${state.attack.side ?? '—'} ${state.attack.intensity}`,
    '',
    'buts',
    ...(state.goals.length === 0
      ? ['   aucun']
      : state.goals.map(
          (g) =>
            `   ${g.minute.padStart(5)}'  ${(g.scorer?.short ?? 'csc').padEnd(16)} ${g.side === 'home' ? '◀' : '▶'}  ${g.score[0]}-${g.score[1]}`,
        )),
    '',
    'cartons',
    ...(state.cards.length === 0
      ? ['   aucun']
      : state.cards.map(
          (c) =>
            `   ${c.minute.padStart(5)}'  ${(c.player?.short ?? '—').padEnd(16)} ${c.card}`,
        )),
  ];

  monitor.textContent = lines.join('\n');
  requestAnimationFrame(refresh);
}

connect();
requestAnimationFrame(refresh);
