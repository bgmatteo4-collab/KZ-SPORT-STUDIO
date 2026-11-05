/**
 * La vitrine : le plateau complet, rejoué ENTIÈREMENT dans le navigateur.
 *
 * Aucun serveur, aucun WebSocket, aucune donnée distante. Le match enregistré
 * est embarqué dans la page et relu par le même réducteur que l'antenne — même
 * timeline, même horloge, même décalage anti-spoiler. Ce que tu vois ici est
 * littéralement ce qui sortirait dans OBS, à la caméra près.
 *
 * Les deux couches sont fusionnées : sans OBS il n'y a pas de webcam à prendre
 * en sandwich, donc on dessine tout d'un coup et on met un cadre d'attente à la
 * place de l'image.
 */

import {
  applyTheme,
  CAM_Z,
  findScene,
  findTheme,
  minuteLabel,
  rectToPixels,
  SCENES,
  SmoothClock,
  StateCursor,
  THEMES,
  TriggerWatcher,
  type MatchEvent,
  type MatchState,
  type Scene,
  type SceneLayer,
  type Theme,
} from '@kz/core';
import { REGISTRY, type Widget, type WidgetContext } from '../overlay/src/widgets/index.js';
import fixture from '../../fixtures/demo-ucl.json';
import '../overlay/src/style.css';
import './showcase.css';

const MIN = 60_000;

// ───────────────────────────── La timeline locale ─────────────────────────────
// Les `t` du fichier sont relatifs au coup d'envoi ; on les ramène en absolu
// une fois pour toutes, exactement comme le fait le rejoueur du serveur.

const KICKOFF = 0;
const events = (fixture.events as MatchEvent[])
  .map((e) => ({ ...e, t: KICKOFF + e.t }))
  .sort((a, b) => a.t - b.t || a.seq - b.seq);

const LAST = events[events.length - 1]!.t;
const cursor = new StateCursor();
cursor.replace(events);

/** Les buts, pour poser des repères sur la réglette. */
const GOALS = events
  .filter((e) => e.kind === 'goal')
  .map((e) => ({ t: e.t, side: (e.payload as { side: string }).side }));

// ─────────────────────────────── L'horloge ───────────────────────────────────

let matchMs = 20 * MIN; // on entre dans le match à la 20e minute
let speed = 1;
let playing = true;
let delayMs = 0; // en vitrine, pas de stream à rattraper
let lastFrame = performance.now();

// ──────────────────────────────── Le plateau ─────────────────────────────────

const stage = document.getElementById('stage')!;
const tv = document.getElementById('tv')!;
let scene: Scene = findScene('match');
let theme: Theme = findTheme('ucl');
let needsPrime = true;

const smoothClock = new SmoothClock();
const watcher = new TriggerWatcher();

interface Mounted {
  widget: Widget;
  host: HTMLElement;
  spec: SceneLayer;
}
const mounted = new Map<string, Mounted>();

/** Le cadre d'attente à la place de la caméra. */
const camBox = document.createElement('div');
camBox.className = 'cam-hole';
camBox.innerHTML = '<span>Ta caméra</span>';
camBox.style.zIndex = String(CAM_Z - 10);

function fit(): void {
  stage.style.transform = `scale(${tv.clientWidth / 1920})`;
}
new ResizeObserver(fit).observe(tv);
fit();

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
  return {
    state,
    clockMs,
    theme,
    opts: spec.opts ?? {},
    box: { w: box.w, h: box.h },
    now: state.t,
    realNow: performance.now(),
    cam: scene.cam ? { ...rectToPixels(scene.cam), style: scene.camStyle } : null,
  };
}

function syncScene(): void {
  // En vitrine on dessine les DEUX couches : sans OBS, rien ne s'intercale.
  const wanted = [...scene.layers].sort((a, b) => a.z - b.z);
  wanted.push({ widget: 'flash', slot: { x: 0, y: 0, w: 1, h: 1 }, z: 999 });
  const keys = new Set(wanted.map((l) => l.widget));

  for (const [key, entry] of mounted) {
    if (keys.has(key)) continue;
    entry.host.dataset.anim = 'exit';
    const { host, widget } = entry;
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
        existing.spec = spec;
        placeHost(existing.host, spec);
        continue;
      }
      existing.widget.destroy?.();
      existing.host.remove();
      mounted.delete(spec.widget);
    }

    const factory = REGISTRY[spec.widget];
    if (!factory) continue;

    const host = document.createElement('div');
    host.className = 'layer';
    host.dataset.widget = spec.widget;
    host.dataset.anim = 'enter';
    placeHost(host, spec);

    const widget = factory(buildContext(cursor.at(matchMs), 0, spec));
    host.append(widget.el);
    stage.append(host);
    mounted.set(spec.widget, { widget, host, spec });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        host.dataset.anim = 'in';
      });
    });
  }

  // Le trou de caméra suit la scène.
  if (scene.cam) {
    const box = rectToPixels(scene.cam);
    camBox.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    camBox.style.width = `${box.w}px`;
    camBox.style.height = `${box.h}px`;
    camBox.dataset.style = scene.camStyle;
    if (!camBox.isConnected) stage.append(camBox);
  } else if (camBox.isConnected) {
    camBox.remove();
  }
}

// ───────────────────────────── Boucle de rendu ───────────────────────────────

function frame(now: number): void {
  const dt = Math.min(250, now - lastFrame);
  lastFrame = now;

  if (playing) {
    matchMs += dt * speed;
    if (matchMs > LAST + 10 * 1000) {
      matchMs = 20 * MIN;
      needsPrime = true;
    }
  }

  const renderAt = matchMs - delayMs;
  const state = cursor.at(renderAt);

  if (needsPrime) {
    watcher.prime(state);
    smoothClock.reset(state.clockMs, state.phase, renderAt);
    needsPrime = false;
  }

  const clockMs = smoothClock.tick(state.clockMs, state.phase, renderAt);

  for (const trigger of watcher.poll(state)) {
    for (const entry of mounted.values()) {
      entry.widget.trigger?.(trigger, buildContext(state, clockMs, entry.spec));
    }
  }

  for (const entry of mounted.values()) {
    entry.widget.update(buildContext(state, clockMs, entry.spec));
  }

  updateBar(state, clockMs);
  requestAnimationFrame(frame);
}

// ──────────────────────────────── Le pupitre ─────────────────────────────────

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const sceneBox = el('scenes');
const themeBox = el('themes');
const scrub = el<HTMLInputElement>('scrub');
const readout = el('readout');
const playButton = el<HTMLButtonElement>('play');

for (const s of SCENES) {
  const b = document.createElement('button');
  b.textContent = s.name;
  b.dataset.scene = s.id;
  b.addEventListener('click', () => {
    scene = s;
    syncScene();
    markAll();
  });
  sceneBox.append(b);
}

for (const t of THEMES) {
  const b = document.createElement('button');
  b.textContent = t.name;
  b.dataset.theme = t.id;
  b.addEventListener('click', () => {
    theme = t;
    applyTheme(theme, document.documentElement);
    markAll();
  });
  themeBox.append(b);
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    markAll();
  });
}

playButton.addEventListener('click', () => {
  playing = !playing;
  playButton.textContent = playing ? 'Pause' : 'Lecture';
});

scrub.min = '0';
scrub.max = String(LAST);
scrub.addEventListener('input', () => {
  matchMs = Number(scrub.value);
  needsPrime = true;
});

// Les repères de but sur la réglette : on peut sauter droit au moment fort.
const marks = el('marks');
for (const goal of GOALS) {
  const mark = document.createElement('button');
  mark.className = 'mark';
  mark.style.left = `${(goal.t / LAST) * 100}%`;
  mark.title = 'Aller au but';
  mark.addEventListener('click', () => {
    // Trois secondes avant, pour voir le carton se déclencher.
    matchMs = goal.t - 3_000;
    needsPrime = true;
    playing = true;
    playButton.textContent = 'Pause';
  });
  marks.append(mark);
}

function markAll(): void {
  for (const b of sceneBox.querySelectorAll<HTMLButtonElement>('[data-scene]')) {
    b.dataset.on = b.dataset.scene === scene.id ? '1' : '0';
  }
  for (const b of themeBox.querySelectorAll<HTMLButtonElement>('[data-theme]')) {
    b.dataset.on = b.dataset.theme === theme.id ? '1' : '0';
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    b.dataset.on = Number(b.dataset.speed) === speed ? '1' : '0';
  }
}

function updateBar(state: MatchState, clockMs: number): void {
  scrub.value = String(matchMs);
  readout.textContent = `${minuteLabel(clockMs, state.phase)}'  ·  ${
    state.meta?.home.abbr ?? ''
  } ${state.score[0]}–${state.score[1]} ${state.meta?.away.abbr ?? ''}`;
}

applyTheme(theme, document.documentElement);
syncScene();
markAll();
requestAnimationFrame(frame);
