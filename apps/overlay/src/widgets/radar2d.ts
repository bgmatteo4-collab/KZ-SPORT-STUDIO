/**
 * Le radar.
 *
 * Il consomme UNIQUEMENT `state.ball` et `state.attack`. Il ne sait pas si les
 * coordonnées viennent de Sportmonks ou d'une dérivation à partir des états
 * d'attaque — c'est tout le bénéfice de l'abstraction : le jour où l'on change
 * de palier ou de fournisseur, ce fichier ne bouge pas.
 *
 * Les positions arrivent à 1 Hz, l'œil en veut soixante. L'interpolation est de
 * la présentation pure : elle a sa place ici et nulle part ailleurs.
 */

import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const INTENSITY_LABEL = {
  attack: 'Attaque',
  dangerous: 'Attaque dangereuse',
  none: '',
} as const;

export const radar2d: WidgetFactory = (): Widget => {
  const crestHome = crestEl();
  const crestAway = crestEl();
  const xgHome = h('div', { class: 'radar__xg' }, ['0.00']);
  const xgAway = h('div', { class: 'radar__xg' }, ['0.00']);

  const plate = (crest: HTMLElement, xg: HTMLElement) =>
    h('div', { class: 'radar__plate' }, [
      crest,
      xg,
      h('div', { class: 't-caption' }, ['xG']),
    ]);

  const canvas = h('canvas', { class: 'radar__canvas' });
  const stateTeam = h('div', { class: 'radar__state-team' }, ['']);
  const stateWhat = h('div', { class: 'radar__state-what' }, ['']);
  const stateBox = h('div', { class: 'radar__state', 'data-on': '0' }, [stateTeam, stateWhat]);

  const field = h('div', { class: 'radar__field' }, [
    canvas,
    stateBox,
    ...(['tl', 'tr', 'bl', 'br'] as const).map((at) =>
      h('i', { class: 'radar__corner', 'data-at': at }),
    ),
  ]);

  const el = h('div', { class: 'radar' }, [
    plate(crestHome, xgHome),
    field,
    plate(crestAway, xgAway),
  ]);

  let drawnX = 0.5;
  let drawnY = 0.5;
  const trail: { x: number; y: number }[] = [];
  let sized = '';

  return {
    el,
    update({ state, theme }: WidgetContext) {
      paintCrest(crestHome, state.meta?.home);
      paintCrest(crestAway, state.meta?.away);
      setText(xgHome, state.stats.xg[0].toFixed(2));
      setText(xgAway, state.stats.xg[1].toFixed(2));

      const intensity = state.attack.intensity;
      const team =
        state.attack.side === 'home'
          ? state.meta?.home.short
          : state.attack.side === 'away'
            ? state.meta?.away.short
            : null;
      setAttr(stateBox, 'data-on', team && intensity !== 'none' ? '1' : '0');
      setText(stateTeam, team ?? '');
      setText(stateWhat, INTENSITY_LABEL[intensity]);

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

      drawnX += (state.ball.x - drawnX) * 0.14;
      drawnY += (state.ball.y - drawnY) * 0.14;
      trail.push({ x: drawnX, y: drawnY });
      if (trail.length > 24) trail.shift();

      context.clearRect(0, 0, w, hgt);
      drawPitch(context, w, hgt, theme.tokens.pitch, theme.tokens.pitchStripe, theme.tokens.pitchLine);

      if (state.attack.side && intensity !== 'none') {
        const danger = intensity === 'dangerous';
        const toRight = state.attack.side === 'home';
        const gradient = context.createLinearGradient(toRight ? w * 0.4 : w * 0.6, 0, toRight ? w : 0, 0);
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, danger ? theme.tokens.live : theme.tokens.accent);
        context.globalAlpha = danger ? 0.3 : 0.14;
        context.fillStyle = gradient;
        context.fillRect(0, 0, w, hgt);
        context.globalAlpha = 1;
      }

      for (let i = 0; i < trail.length; i += 1) {
        const point = trail[i]!;
        context.beginPath();
        context.arc(point.x * w, point.y * hgt, (hgt / 120) * (0.8 + i / trail.length), 0, Math.PI * 2);
        context.fillStyle = `rgba(255,255,255,${((i / trail.length) * 0.35).toFixed(3)})`;
        context.fill();
      }

      const radius = Math.max(4, hgt / 46);
      context.beginPath();
      context.arc(drawnX * w, drawnY * hgt, radius, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.shadowColor = 'rgba(0,0,0,0.75)';
      context.shadowBlur = radius * 1.6;
      context.fill();
      context.shadowBlur = 0;
    },
  };
};

function drawPitch(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  turf: string,
  stripe: string,
  line: string,
): void {
  c.fillStyle = turf;
  c.fillRect(0, 0, w, h);

  // Bandes de tonte : trois lignes de code, et le terrain cesse d'être un aplat.
  c.fillStyle = stripe;
  for (let i = 0; i < 12; i += 2) c.fillRect((i / 12) * w, 0, w / 12, h);

  c.strokeStyle = line;
  c.lineWidth = Math.max(1.2, h / 150);
  const pad = h * 0.07;

  c.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  c.beginPath();
  c.moveTo(w / 2, pad);
  c.lineTo(w / 2, h - pad);
  c.stroke();

  c.beginPath();
  c.arc(w / 2, h / 2, h * 0.14, 0, Math.PI * 2);
  c.stroke();

  c.beginPath();
  c.arc(w / 2, h / 2, Math.max(1.5, h / 110), 0, Math.PI * 2);
  c.fillStyle = line;
  c.fill();

  const boxH = h * 0.46;
  const boxW = w * 0.13;
  c.strokeRect(pad, (h - boxH) / 2, boxW, boxH);
  c.strokeRect(w - pad - boxW, (h - boxH) / 2, boxW, boxH);

  const sixH = h * 0.22;
  const sixW = w * 0.05;
  c.strokeRect(pad, (h - sixH) / 2, sixW, sixH);
  c.strokeRect(w - pad - sixW, (h - sixH) / 2, sixW, sixH);
}
