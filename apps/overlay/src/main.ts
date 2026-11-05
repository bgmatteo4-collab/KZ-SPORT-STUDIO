/**
 * L'overlay : la source navigateur d'OBS.
 *
 *   /overlay/?layer=fg     couches devant la caméra
 *   /overlay/?layer=bg     couches derrière la caméra, et son image en mode browser
 *   &debug=1               moniteur de contrôle
 *
 * LE SEUL TEST QUI COMPTE : recharger cette page en pleine mi-temps doit la
 * rendre juste en moins d'une seconde, sans rejouer aucune animation.
 * Tout ce fichier est construit autour de ça.
 */

import {
  applyTheme,
  findScene,
  findTheme,
  layersFor,
  rectToPixels,
  SmoothClock,
  TriggerWatcher,
  type MatchState,
  type OverlayLayer,
  type Scene,
  type SceneLayer,
  type Theme,
  type Trigger,
} from '@kz/core';
import { Connection } from './connection.js';
import { REGISTRY, type Widget, type WidgetContext } from './widgets/index.js';

const params = new URLSearchParams(location.search);
const LAYER: OverlayLayer = params.get('layer') === 'bg' ? 'bg' : 'fg';
const DEBUG = params.get('debug') === '1';

const stage = document.getElementById('stage')!;
const debugEl = document.getElementById('debug')!;
if (DEBUG) debugEl.removeAttribute('hidden');

const connection = new Connection();
const smoothClock = new SmoothClock();
const watcher = new TriggerWatcher();

let theme: Theme = findTheme('kztv');
let scene: Scene = findScene('match');
/** Un saut de temps est survenu : réarmer sans rien rejouer. */
let needsPrime = true;

// ───────────────────── Mise à l'échelle du plateau 1920×1080 ──────────────────
// Dans OBS la source fait exactement 1920×1080, donc l'échelle vaut 1. Ailleurs,
// ça permet de prévisualiser dans une fenêtre quelconque.

function fitStage(): void {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitStage);
fitStage();

// ───────────────────────────── Couches montées ───────────────────────────────

interface Mounted {
  widget: Widget;
  host: HTMLElement;
  spec: SceneLayer;
}

const mounted = new Map<string, Mounted>();

/**
 * La caméra en mode `browser`. C'est la couche `bg` qui porte l'image, pour que
 * les widgets d'avant-plan passent par-dessus. En mode `obs`, l'image vient
 * d'OBS et cet élément reste vide.
 */
const camVideo = document.createElement('video');
camVideo.className = 'cam-video';
// Au-dessus du fond (z 10) et des panneaux (z 20), sous la profondeur de la
// caméra (CAM_Z). Sans ça, le fond habillé la recouvre entièrement.
camVideo.style.zIndex = '90';
camVideo.autoplay = true;
camVideo.muted = true;
camVideo.playsInline = true;
let camRequested = false;

async function ensureCamStream(): Promise<void> {
  if (camRequested) return;
  camRequested = true;
  try {
    camVideo.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: false,
    });
  } catch (error) {
    // Pas de caméra autorisée : on continue sans. Règle n°6.
    console.warn('[kz] caméra indisponible', error);
  }
}

/**
 * Les couches voulues sur cette source : celles de la scène, du bon côté de la
 * caméra, plus les notifications qui ne dépendent d'aucune scène.
 */
function wantedLayers(current: Scene): SceneLayer[] {
  const list = layersFor(current, LAYER);
  if (LAYER === 'fg') {
    list.push({ widget: 'flash', slot: { x: 0, y: 0, w: 1, h: 1 }, z: 999 });
  }
  return list;
}

function syncScene(current: Scene): void {
  const wanted = wantedLayers(current);
  const keys = new Set(wanted.map((l) => l.widget));

  // Sortie des couches qui ne sont plus de la scène.
  for (const [key, entry] of mounted) {
    if (keys.has(key)) continue;
    entry.host.dataset.anim = 'exit';
    const host = entry.host;
    const widget = entry.widget;
    mounted.delete(key);
    window.setTimeout(() => {
      widget.destroy?.();
      host.remove();
    }, 700);
  }

  for (const spec of wanted) {
    const existing = mounted.get(spec.widget);

    if (existing) {
      if (sameOpts(existing.spec.opts, spec.opts)) {
        // Déjà à l'antenne : il se DÉPLACE, il ne réapparaît pas. C'est ce qui
        // évite le clignotement du scorebug à chaque changement de scène.
        existing.spec = spec;
        placeHost(existing.host, spec);
        continue;
      }
      // Les options sont lues à la CONSTRUCTION du widget. Si elles changent
      // d'une scène à l'autre, réutiliser l'instance lui laisserait celles de
      // sa première scène — c'est comme ça qu'un banc de remplaçants disparaît.
      existing.widget.destroy?.();
      existing.host.remove();
      mounted.delete(spec.widget);
    }

    const factory = REGISTRY[spec.widget];
    if (!factory) {
      console.warn(`[kz] widget inconnu : ${spec.widget}`);
      continue;
    }

    const host = document.createElement('div');
    host.className = 'layer';
    host.dataset.widget = spec.widget;
    host.dataset.anim = 'enter';
    placeHost(host, spec);

    const context = buildContext(connection.cursor.at(connection.renderTime()), 0, spec);
    const widget = factory(context);
    host.append(widget.el);
    stage.append(host);

    mounted.set(spec.widget, { widget, host, spec });

    // Une image d'attente avant d'animer : sinon la transition est avalée.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        host.dataset.anim = 'in';
      });
    });
  }

  // L'image de la caméra, en mode navigateur et sur la couche de fond.
  const wantsCam = LAYER === 'bg' && connection.control.camMode === 'browser' && current.cam !== null;
  if (wantsCam && current.cam) {
    void ensureCamStream();
    const box = rectToPixels(current.cam);
    camVideo.dataset.style = current.camStyle;
    camVideo.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    camVideo.style.width = `${box.w}px`;
    camVideo.style.height = `${box.h}px`;
    camVideo.style.transition = `transform var(--dur-slow) var(--ease), width var(--dur-slow) var(--ease), height var(--dur-slow) var(--ease)`;
    if (!camVideo.isConnected) stage.prepend(camVideo);
  } else if (camVideo.isConnected) {
    camVideo.remove();
  }
}

/** Deux jeux d'options sont-ils équivalents ? */
function sameOpts(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function placeHost(host: HTMLElement, spec: SceneLayer): void {
  const box = rectToPixels(spec.slot);
  host.style.left = `${box.x}px`;
  host.style.top = `${box.y}px`;
  host.style.width = `${box.w}px`;
  host.style.height = `${box.h}px`;
  host.style.zIndex = String(spec.z);
}

function buildContext(state: MatchState, clockMs: number, spec: SceneLayer): WidgetContext {
  const box = rectToPixels(spec.slot);
  const cam = scene.cam
    ? { ...rectToPixels(scene.cam), style: scene.camStyle }
    : null;
  return {
    state,
    clockMs,
    theme,
    opts: spec.opts ?? {},
    box: { w: box.w, h: box.h },
    now: state.t,
    cam,
  };
}

// ──────────────────────────────── Contrôle ───────────────────────────────────

connection.onControl = (control) => {
  const nextTheme = findTheme(control.themeId);
  if (nextTheme.id !== theme.id) {
    theme = nextTheme;
    applyTheme(theme, document.documentElement);
  }

  const nextScene = findScene(control.sceneId);
  const sceneChanged = nextScene.id !== scene.id;
  scene = nextScene;
  syncScene(scene);
  if (sceneChanged) document.documentElement.dataset.scene = scene.id;
};

connection.onJump = () => {
  needsPrime = true;
};

applyTheme(theme, document.documentElement);
connection.connect();
syncScene(scene);

// ─────────────────────────────── Boucle de rendu ─────────────────────────────

function dispatch(trigger: Trigger, state: MatchState, clockMs: number): void {
  for (const entry of mounted.values()) {
    entry.widget.trigger?.(trigger, buildContext(state, clockMs, entry.spec));
  }
}

function frame(): void {
  // L'instant à rendre : le temps du serveur MOINS le décalage anti-spoiler.
  // C'est toute l'idée du projet, et elle tient en une ligne.
  const now = connection.renderTime();
  const state = connection.cursor.at(now);

  if (needsPrime) {
    // Rechargement ou changement de délai : tout le passé vient d'entrer dans
    // le champ visible. On le marque comme vu, on ne rejoue rien.
    watcher.prime(state);
    smoothClock.reset(state.clockMs, state.phase, now);
    needsPrime = false;
  }

  // `now` est le temps du serveur, donc déjà à la bonne vitesse en rejeu
  // accéléré. Passer `performance.now()` ici ferait dériver le chrono à x20.
  const clockMs = smoothClock.tick(state.clockMs, state.phase, now);

  for (const trigger of watcher.poll(state)) dispatch(trigger, state, clockMs);

  for (const entry of mounted.values()) {
    entry.widget.update(buildContext(state, clockMs, entry.spec));
  }

  if (DEBUG) renderDebug(state, now, clockMs);

  requestAnimationFrame(frame);
}

function renderDebug(state: MatchState, now: number, clockMs: number): void {
  const lines = [
    `couche      ${LAYER}`,
    `scène       ${scene.id}`,
    `thème       ${theme.id}`,
    `lien        ${connection.connected ? 'ouvert' : 'coupé'}`,
    `source      ${connection.provider.name} ${connection.provider.connected ? '✓' : '✗'}`,
    `délai       ${(connection.control.delayMs / 1000).toFixed(1)} s`,
    `vitesse     x${connection.control.timeScale}`,
    `écart NTP   ${connection.sync.currentOffset.toFixed(0)} ms (${connection.sync.samples})`,
    `timeline    ${connection.cursor.size} év.  seq ${state.lastSeq}`,
    `phase       ${state.phase}`,
    `chrono      ${(clockMs / 60000).toFixed(2)} min`,
    `score       ${state.score[0]}-${state.score[1]}`,
    `ballon      ${state.ball.x.toFixed(2)} / ${state.ball.y.toFixed(2)}`,
    `attaque     ${state.attack.side ?? '—'} ${state.attack.intensity}`,
    `pression    ${state.pressure.home.toFixed(1)} / ${state.pressure.away.toFixed(1)}`,
    `rendu à     ${new Date(now).toISOString().slice(11, 23)}`,
  ];
  debugEl.textContent = lines.join('\n');
}

requestAnimationFrame(frame);
