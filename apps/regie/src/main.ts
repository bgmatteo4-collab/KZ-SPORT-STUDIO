/**
 * La régie.
 *
 * Elle n'affiche pas l'habillage : elle le pilote. Règle n°1 du projet — elle
 * envoie des INTENTIONS, le serveur décide, borne les valeurs et rediffuse à
 * tout le monde. Deux régies ouvertes restent donc toujours d'accord, et
 * l'overlay ne peut pas se désynchroniser d'elles.
 *
 * Trois partis pris qui en font un outil de direct plutôt qu'un formulaire :
 *
 *   • TOUT TIENT SUR UN ÉCRAN. Rien ne défile.
 *   • ON VOIT CE QUI EST À L'ANTENNE. Le moniteur est le vrai overlay, pas une
 *     description de l'overlay.
 *   • LE CLAVIER D'ABORD. 1 à 9 pour les scènes, flèches pour le décalage.
 *     En plein match, on ne vise pas un bouton à la souris.
 */

import {
  clockLabel,
  findScene,
  insertActif,
  INSERTS,
  PHASE_LABEL,
  SCENES,
  StateCursor,
  THEMES,
  ClockSync,
  DEFAULT_CONTROL,
  type CardEntry,
  type ClientMessage,
  type Command,
  type ControlState,
  type GoalEntry,
  type MatchState,
  type ProviderStatus,
  type ServerMessage,
  type SubEntry,
} from '@kz/core';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const lampLink = el('lamp-link');
const lampSource = el('lamp-source');
const lampLive = el('lamp-live');
const nowHome = el('now-home');
const nowAway = el('now-away');
const nowScore = el('now-score');
const nowClock = el('now-clock');
const nowPhase = el('now-phase');
const sceneName = el('scene-name');
const sourceDetail = el('source-detail');
const scenesBox = el('scenes');
const themesBox = el('themes');
const camBox = el('cam-mode');
const speedBox = el('speed');
const insertModeBox = el('insert-mode');
const insertForceBox = el('insert-force');
const insertMotif = el('insert-motif');
const feedBox = el('feed');
const delayInput = el<HTMLInputElement>('delay');
const delayValue = el<HTMLOutputElement>('delay-value');
const toast = el('toast');

const cursor = new StateCursor();
const sync = new ClockSync();
let control: ControlState = { ...DEFAULT_CONTROL };
let provider: ProviderStatus = { name: '…', connected: false, lastEventAt: null };
let socket: WebSocket | null = null;
let connected = false;
/** Le curseur est-il saisi ? Si oui, on ne l'écrase pas sous les doigts. */
let draggingDelay = false;

// ───────────────────────────── Pupitre de scènes ──────────────────────────────

SCENES.forEach((scene, index) => {
  const button = document.createElement('button');
  button.className = 'scene';
  button.dataset.scene = scene.id;
  const key = index < 9 ? String(index + 1) : index === 9 ? '0' : '';
  button.append(
    Object.assign(document.createElement('span'), {
      className: 'scene__key',
      textContent: key || '—',
    }),
    Object.assign(document.createElement('span'), { textContent: scene.name }),
  );
  button.addEventListener('click', () => send({ name: 'set-scene', sceneId: scene.id }));
  scenesBox.append(button);
});

for (const theme of THEMES) {
  const button = document.createElement('button');
  button.textContent = theme.name;
  button.dataset.theme = theme.id;
  button.addEventListener('click', () => send({ name: 'set-theme', themeId: theme.id }));
  themesBox.append(button);
}

for (const button of insertModeBox.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  button.addEventListener('click', () =>
    send({ name: 'set-insert-mode', insertMode: button.dataset.mode as 'auto' | 'off' }),
  );
}

// « Auto » rend la main à la régie automatique ; les autres imposent un panneau.
for (const spec of [{ id: '', label: 'Auto' }, ...INSERTS.map((i) => ({ id: i.id, label: i.id }))]) {
  const button = document.createElement('button');
  button.textContent = spec.label;
  button.dataset.force = spec.id;
  button.addEventListener('click', () =>
    send({ name: 'force-insert', insertId: spec.id === '' ? null : spec.id }),
  );
  insertForceBox.append(button);
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

delayInput.addEventListener('pointerdown', () => { draggingDelay = true; });
delayInput.addEventListener('pointerup', () => { draggingDelay = false; });
delayInput.addEventListener('input', () => {
  const ms = Number(delayInput.value);
  delayValue.textContent = formatDelay(ms);
  send({ name: 'set-delay', delayMs: ms });
});

// ──────────────────────────── Sources OBS ────────────────────────────────────

const urls = {
  fg: `${location.origin}/overlay/?layer=fg`,
  bg: `${location.origin}/overlay/?layer=bg`,
};
el('url-fg').textContent = urls.fg;
el('url-bg').textContent = urls.bg;

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
    const which = button.dataset.copy as 'fg' | 'bg';
    try {
      await navigator.clipboard.writeText(urls[which]);
      flash('Adresse copiée');
    } catch {
      // Presse-papiers refusé (page non sécurisée) : on sélectionne pour que
      // l'utilisateur puisse copier à la main plutôt que de rester sans rien.
      const code = button.querySelector('code');
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
      flash('Sélectionné — Ctrl+C');
    }
  });
}

let toastTimer = 0;
function flash(message: string): void {
  toast.textContent = message;
  toast.dataset.on = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.dataset.on = '0'; }, 1600);
}

// ─────────────────────────────── Le clavier ──────────────────────────────────
// En plein match, on ne vise pas un bouton à la souris.

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key >= '1' && event.key <= '9') {
    const scene = SCENES[Number(event.key) - 1];
    if (scene) {
      send({ name: 'set-scene', sceneId: scene.id });
      event.preventDefault();
    }
    return;
  }
  if (event.key === '0' && SCENES[9]) {
    send({ name: 'set-scene', sceneId: SCENES[9].id });
    event.preventDefault();
    return;
  }

  // Flèches : le décalage, finement. Avec Maj, par seconde entière.
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const step = event.shiftKey ? 1000 : 250;
    send({ name: 'nudge-delay', deltaMs: event.key === 'ArrowLeft' ? -step : step });
    event.preventDefault();
  }
});

// ─────────────────────── Le moniteur : le vrai overlay ───────────────────────
// Pas une description de ce qui est à l'antenne : ce qui est à l'antenne.

const monitor = el('monitor');
function fitMonitor(): void {
  const scale = monitor.clientWidth / 1920;
  for (const frame of monitor.querySelectorAll('iframe')) {
    frame.style.transform = `scale(${scale})`;
  }
}
new ResizeObserver(fitMonitor).observe(monitor);
fitMonitor();

// ─────────────────────────────── Connexion ───────────────────────────────────

function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = ws;

  ws.addEventListener('open', () => {
    connected = true;
    ping();
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

window.setInterval(ping, 5_000);

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
  mark(insertModeBox, 'mode', next.insertMode);
  mark(insertForceBox, 'force', next.insertForce ?? '');
  sceneName.textContent = findScene(next.sceneId).name;
}

function mark(box: HTMLElement, attribute: string, value: string): void {
  for (const button of box.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`)) {
    button.dataset.on = button.dataset[attribute] === value ? '1' : '0';
  }
}

function formatDelay(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

// ────────────────────────────── Rafraîchissement ─────────────────────────────

type FeedItem =
  | { t: number; kind: 'goal'; entry: GoalEntry }
  | { t: number; kind: 'card'; entry: CardEntry }
  | { t: number; kind: 'sub'; entry: SubEntry };

let feedSignature = '';

function refresh(): void {
  const state = cursor.at(sync.now() - control.delayMs);

  lampLink.dataset.on = connected ? '1' : '0';
  lampSource.dataset.on = provider.connected ? '1' : '0';
  const onAir = state.phase !== 'pre' && state.phase !== 'full_time';
  lampLive.dataset.on = onAir ? '1' : '0';

  nowHome.textContent = state.meta?.home.abbr ?? '—';
  nowAway.textContent = state.meta?.away.abbr ?? '—';
  nowScore.textContent = `${state.score[0]}–${state.score[1]}`;

  const label = clockLabel(state.clockMs, state.phase, state.clock.addedMinutes);
  nowClock.textContent = onAir ? `${label.main}${label.added ?? ''}` : '—';
  nowPhase.textContent = PHASE_LABEL[state.phase];

  sourceDetail.textContent = provider.detail ?? provider.name;

  // Ce que la régie automatique montre en ce moment — et sa raison. Sans le
  // motif, un panneau qui surgit ressemble à un défaut.
  if (control.insertMode === 'off') {
    insertMotif.textContent = 'coupés';
  } else if (control.insertForce) {
    insertMotif.textContent = `${control.insertForce} · imposé`;
  } else {
    const actif = findScene(control.sceneId).insertSlot
      ? insertActif(state, sync.now() - control.delayMs)
      : null;
    insertMotif.textContent = actif ? `${actif.spec.id} · ${actif.motif}` : 'rien à l’antenne';
  }

  renderFeed(state);
  requestAnimationFrame(refresh);
}

function renderFeed(state: MatchState): void {
  const items: FeedItem[] = [
    ...state.goals.map((entry) => ({ t: entry.t, kind: 'goal' as const, entry })),
    ...state.cards.map((entry) => ({ t: entry.t, kind: 'card' as const, entry })),
    ...state.subs.map((entry) => ({ t: entry.t, kind: 'sub' as const, entry })),
  ].sort((a, b) => b.t - a.t);

  const signature = items.map((i) => `${i.kind}${i.entry.seq}`).join(',');
  if (signature === feedSignature) return;
  feedSignature = signature;

  feedBox.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'feed__empty';
    empty.textContent = 'Rien encore.';
    feedBox.append(empty);
    return;
  }

  for (const item of items) {
    const side = item.entry.side === 'home' ? state.meta?.home.abbr : state.meta?.away.abbr;
    const row = document.createElement('li');
    row.className = 'ev';

    const minute = document.createElement('span');
    minute.className = 'ev__minute';
    minute.textContent = `${item.entry.minute}'`;

    const mark = document.createElement('i');
    mark.className = 'ev__mark';
    mark.dataset.kind =
      item.kind === 'card' && item.entry.card !== 'yellow' ? 'card-red' : item.kind;

    const name = document.createElement('span');
    name.className = 'ev__name';
    name.textContent = describe(item);

    const team = document.createElement('span');
    team.className = 'ev__side';
    team.textContent = side ?? '';

    row.append(minute, mark, name, team);
    feedBox.append(row);
  }
}

function describe(item: FeedItem): string {
  switch (item.kind) {
    case 'goal':
      return `${item.entry.scorer?.short ?? 'But'}${item.entry.penalty ? ' (sp)' : ''}${
        item.entry.ownGoal ? ' (csc)' : ''
      }`;
    case 'card':
      return item.entry.player?.short ?? 'Carton';
    case 'sub':
      return `${item.entry.in?.short ?? '?'} ↔ ${item.entry.out?.short ?? '?'}`;
  }
}

connect();
requestAnimationFrame(refresh);
