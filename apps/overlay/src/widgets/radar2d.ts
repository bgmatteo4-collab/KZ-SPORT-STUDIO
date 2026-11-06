/**
 * Le radar.
 *
 * Il consomme UNIQUEMENT `state.ball` et `state.attack`. Il ne sait pas si les
 * coordonnées viennent de Sportmonks ou d'une dérivation à partir des états
 * d'attaque — le jour où l'on change de palier, ce fichier ne bouge pas.
 *
 * ── Ce qui fait qu'un radar se lit à l'antenne ────────────────────────────────
 *
 *  • Une pelouse VIVE. Sombre, elle se confond avec le fond du plateau.
 *  • Une TRAÎNÉE EN SEGMENTS reliés par des nœuds, pas un dégradé de points :
 *    on doit pouvoir suivre le chemin du ballon, pas deviner une direction.
 *  • Un ballon qui brille, d'une couleur que rien d'autre ne porte.
 *  • L'état du jeu en toutes lettres, dans un cartouche — pas du texte posé.
 *  • Un but qui prend tout l'écran du radar : c'est le moment qu'on regarde.
 *
 * Les positions arrivent à 1 Hz, l'œil en veut soixante : l'interpolation est
 * de la présentation pure, elle a sa place ici et nulle part ailleurs.
 */

import type { ThemeTokens, Trigger } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const INTENSITY_LABEL = {
  attack: 'Attaque',
  dangerous: 'Attaque dangereuse',
  none: 'Jeu au milieu',
} as const;

/** Durée de l'envahissement sur un but. */
const GOAL_HOLD = 4_600;
/** Longueur de la traînée, en relevés. */
const TRAIL = 16;

export const radar2d: WidgetFactory = (): Widget => {
  const crestHome = crestEl();
  const crestAway = crestEl();
  // Un tiret, pas « 0.00 » : tant qu'aucun fournisseur n'a donné d'xG, zéro
  // serait une affirmation, et elle serait fausse.
  const xgHome = h('div', { class: 'radar__xg' }, ['—']);
  const xgAway = h('div', { class: 'radar__xg' }, ['—']);

  const plate = (crest: HTMLElement, xg: HTMLElement) =>
    h('div', { class: 'radar__plate' }, [crest, xg, h('div', { class: 't-caption' }, ['xG'])]);

  const canvas = h('canvas', { class: 'radar__canvas' });
  const stateWhat = h('div', { class: 'radar__state-what' }, ['']);
  const stateTeam = h('div', { class: 'radar__state-team' }, ['']);
  const stateBox = h('div', { class: 'radar__state', 'data-on': '0' }, [stateWhat, stateTeam]);

  const goalTitle = h('div', { class: 'radar__goal-title' }, ['But !']);
  const goalTeam = h('div', { class: 'radar__goal-team' }, ['']);
  const goalBox = h('div', { class: 'radar__goal', 'data-on': '0' }, [goalTitle, goalTeam]);

  const field = h('div', { class: 'radar__field' }, [
    canvas,
    stateBox,
    goalBox,
    ...(['tl', 'tr', 'bl', 'br'] as const).map((at) =>
      h('i', { class: 'radar__corner', 'data-at': at }),
    ),
  ]);

  const el = h('div', { class: 'radar' }, [plate(crestHome, xgHome), field, plate(crestAway, xgAway)]);

  let drawnX = 0.5;
  let drawnY = 0.5;
  const trail: { x: number; y: number }[] = [];
  let sized = '';
  let goalUntil = 0;

  return {
    // Un canevas : il doit être repeint à chaque image.
    animated: true,
    el,

    trigger(trigger: Trigger, ctx: WidgetContext) {
      // Un but prend tout le radar : c'est le moment que tout le monde regarde.
      if (trigger.kind !== 'goal') return;
      const team =
        trigger.entry.side === 'home' ? ctx.state.meta?.home : ctx.state.meta?.away;
      setText(goalTeam, team?.short ?? '');
      setAttr(goalBox, 'data-on', '1');
      goalUntil = ctx.realNow + GOAL_HOLD;
    },

    update({ state, theme, realNow }: WidgetContext) {
      paintCrest(crestHome, state.meta?.home);
      paintCrest(crestAway, state.meta?.away);
      const xg = state.stats.xg;
      setText(xgHome, xg ? xg[0].toFixed(2) : '—');
      setText(xgAway, xg ? xg[1].toFixed(2) : '—');

      // Temps RÉEL, pour la même raison que le carton plein écran.
      if (goalUntil !== 0 && realNow >= goalUntil) {
        setAttr(goalBox, 'data-on', '0');
        goalUntil = 0;
      }
      const celebrating = goalUntil !== 0;

      const intensity = state.attack.intensity;
      const team =
        state.attack.side === 'home'
          ? state.meta?.home.short
          : state.attack.side === 'away'
            ? state.meta?.away.short
            : null;
      // Aucun fournisseur gratuit ne publie la position du ballon. Dessiner un
      // ballon au rond central ferait croire au spectateur qu'on suit le jeu —
      // c'est le pire mensonge que ce plateau puisse dire, parce qu'il est
      // crédible. On affiche un terrain vide, et on explique pourquoi.
      const sansBallon = state.ball === null;
      setAttr(stateBox, 'data-on', celebrating ? '0' : '1');
      setAttr(stateBox, 'data-intensity', sansBallon ? 'none' : intensity);
      setText(stateWhat, sansBallon ? 'Position du ballon indisponible' : INTENSITY_LABEL[intensity]);
      // Pas de camp qui attaque : pas de ligne. Un tiret est du bruit.
      setText(stateTeam, sansBallon ? '' : (team ?? ''));

      const context = canvas.getContext('2d');
      if (!context) return;

      const rect = field.getBoundingClientRect();
      if (rect.width === 0) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const key = `${Math.round(rect.width)}x${Math.round(rect.height)}@${dpr}`;
      if (sized !== key) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        sized = key;
      }

      const w = canvas.width;
      const hgt = canvas.height;

      const ballon = state.ball;
      if (ballon) {
        drawnX += (ballon.x - drawnX) * 0.12;
        drawnY += (ballon.y - drawnY) * 0.12;
        // Un nœud par relevé, pas par image : la traînée doit dessiner le
        // CHEMIN du ballon, pas une bouillie de soixante points par seconde.
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(last.x - drawnX, last.y - drawnY) > 0.022) {
          trail.push({ x: drawnX, y: drawnY });
          if (trail.length > TRAIL) trail.shift();
        }
      } else if (trail.length > 0) {
        trail.length = 0;
      }

      context.clearRect(0, 0, w, hgt);
      drawPitch(context, w, hgt, theme.tokens, celebrating);

      if (!celebrating) {
        drawAttack(context, w, hgt, state.attack, theme.tokens);
        if (ballon) {
          drawTrail(context, w, hgt, trail, theme.tokens);
          drawBall(context, w, hgt, drawnX, drawnY, theme.tokens);
        }
      }
    },
  };
};

function drawPitch(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: ThemeTokens,
  celebrating: boolean,
): void {
  c.fillStyle = celebrating ? t.goalFlood : t.pitch;
  c.fillRect(0, 0, w, h);

  // Bandes de tonte verticales, franches. C'est ce qui fait « pelouse » plutôt
  // qu'« aplat de couleur ».
  c.fillStyle = t.pitchStripe;
  for (let i = 0; i < 14; i += 2) c.fillRect((i / 14) * w, 0, w / 14, h);

  // Un voile sombre en bas : le cartouche d'état doit rester lisible.
  const veil = c.createLinearGradient(0, h * 0.55, 0, h);
  veil.addColorStop(0, 'rgba(0,0,0,0)');
  veil.addColorStop(1, 'rgba(0,0,0,0.38)');
  c.fillStyle = veil;
  c.fillRect(0, 0, w, h);

  c.strokeStyle = t.pitchLine;
  c.lineWidth = Math.max(1.6, h / 150);
  const pad = h * 0.07;

  c.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
  c.beginPath();
  c.moveTo(w / 2, pad);
  c.lineTo(w / 2, h - pad);
  c.stroke();
  c.beginPath();
  c.arc(w / 2, h / 2, h * 0.15, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(w / 2, h / 2, Math.max(2, h / 100), 0, Math.PI * 2);
  c.fillStyle = t.pitchLine;
  c.fill();

  const boxH = h * 0.48;
  const boxW = w * 0.13;
  c.strokeRect(pad, (h - boxH) / 2, boxW, boxH);
  c.strokeRect(w - pad - boxW, (h - boxH) / 2, boxW, boxH);

  const sixH = h * 0.23;
  const sixW = w * 0.05;
  c.strokeRect(pad, (h - sixH) / 2, sixW, sixH);
  c.strokeRect(w - pad - sixW, (h - sixH) / 2, sixW, sixH);
}

function drawAttack(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  attack: { side: 'home' | 'away' | null; intensity: string },
  t: ThemeTokens,
): void {
  if (!attack.side || attack.intensity === 'none') return;
  const danger = attack.intensity === 'dangerous';
  const toRight = attack.side === 'home';
  const g = c.createLinearGradient(toRight ? w * 0.35 : w * 0.65, 0, toRight ? w : 0, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, danger ? t.live : t.accent);
  c.globalAlpha = danger ? 0.34 : 0.16;
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.globalAlpha = 1;
}

function drawTrail(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  trail: { x: number; y: number }[],
  t: ThemeTokens,
): void {
  if (trail.length < 2) return;

  c.beginPath();
  trail.forEach((p, i) => (i === 0 ? c.moveTo(p.x * w, p.y * h) : c.lineTo(p.x * w, p.y * h)));
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = Math.max(1.6, h / 190);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();

  trail.forEach((p, i) => {
    if (i === trail.length - 1) return;
    c.beginPath();
    c.arc(p.x * w, p.y * h, Math.max(2.4, h / 105), 0, Math.PI * 2);
    c.fillStyle = t.ball;
    c.globalAlpha = 0.35 + (i / trail.length) * 0.5;
    c.fill();
    c.globalAlpha = 1;
  });
}

function drawBall(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  x: number,
  y: number,
  t: ThemeTokens,
): void {
  const r = Math.max(5, h / 34);
  const cx = x * w;
  const cy = y * h;

  // Halo
  const halo = c.createRadialGradient(cx, cy, 0, cx, cy, r * 3.4);
  halo.addColorStop(0, t.ball);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = 0.4;
  c.fillStyle = halo;
  c.beginPath();
  c.arc(cx, cy, r * 3.4, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;

  // Anneau blanc, puis le ballon
  c.beginPath();
  c.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = Math.max(1.6, h / 200);
  c.stroke();

  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = t.ball;
  c.fill();
}
