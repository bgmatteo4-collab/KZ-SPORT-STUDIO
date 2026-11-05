/**
 * Écus et maillots, dessinés à partir des couleurs de l'équipe.
 *
 * Choix assumé : on n'embarque aucun logo de club. Les écus officiels sont des
 * marques déposées, et un dépôt qui les contient n'est pas distribuable. On
 * dessine donc un écu à partir du trigramme et des couleurs — à l'antenne, dans
 * un panneau de 24 px, la différence ne se voit pas, et le jour où tu as des
 * fichiers sous licence, seule cette fonction change.
 */

import type { Team, TeamBrief } from '@kz/core';
import { h } from '../dom.js';

export type AnyTeam = Team | TeamBrief;

const NS = 'http://www.w3.org/2000/svg';

export function crestEl(extraClass = ''): HTMLElement {
  const el = h('div', { class: `crest ${extraClass}`.trim() });
  el.textContent = '';
  return el;
}

export function paintCrest(el: HTMLElement, team: AnyTeam | undefined | null): void {
  if (!team) {
    el.style.background = 'var(--pill)';
    if (el.textContent !== '') el.textContent = '';
    return;
  }
  const alt = team.colorAlt ?? shade(team.color, -28);
  const background = `linear-gradient(160deg, ${team.color} 0%, ${alt} 100%)`;
  if (el.style.background !== background) el.style.background = background;
  el.style.color = readable(team.color);
  if (el.textContent !== team.abbr) el.textContent = team.abbr;
}

/** Un maillot : rayé si l'équipe a deux couleurs, uni sinon. */
export function jerseyEl(team: AnyTeam | undefined, keeper = false): HTMLElement {
  const wrap = h('div', { class: 'jersey' });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 36');

  const base = keeper ? '#e8b45c' : (team?.color ?? '#6b7280');
  const stripe = keeper ? '#c08c2e' : (team?.colorAlt ?? shade(base, -34));

  const id = `j${Math.random().toString(36).slice(2, 8)}`;
  const clip = document.createElementNS(NS, 'clipPath');
  clip.setAttribute('id', id);

  const shape = () => {
    const p = document.createElementNS(NS, 'path');
    // Épaules, manches, corps. Volontairement simple : à 40 px, le détail est du bruit.
    p.setAttribute(
      'd',
      'M14 3 L20 1 L26 3 L35 7 L31.5 15 L28 13 L28 34 L12 34 L12 13 L8.5 15 L5 7 Z',
    );
    return p;
  };

  const body = shape();
  body.setAttribute('fill', base);
  clip.append(shape());

  const stripes = document.createElementNS(NS, 'g');
  stripes.setAttribute('clip-path', `url(#${id})`);
  const kit = keeper ? 'plain' : (team?.kit ?? 'plain');

  if (kit === 'striped') {
    for (let x = 12; x < 32; x += 8) {
      stripes.append(bar(x, 0, 4, 36, stripe));
    }
  } else if (kit === 'hoops') {
    for (let y = 6; y < 34; y += 9) {
      stripes.append(bar(0, y, 40, 4, stripe));
    }
  } else if (!keeper) {
    // Uni : juste les manches dans la seconde couleur. Suffit à identifier
    // l'équipe sans inventer un maillot qui n'existe pas.
    stripes.append(bar(5, 3, 8, 13, stripe));
    stripes.append(bar(27, 3, 8, 13, stripe));
  }

  const outline = shape();
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'rgba(0,0,0,0.45)');
  outline.setAttribute('stroke-width', '1.4');

  svg.append(clip, body, stripes, outline);
  wrap.append(svg);
  return wrap;
}

function bar(x: number, y: number, w: number, h: number, fill: string): SVGElement {
  const rect = document.createElementNS(NS, 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  rect.setAttribute('fill', fill);
  return rect;
}

/** Éclaircit (positif) ou assombrit (négatif) une couleur hexadécimale. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const channel = (raw: string) => {
    const value = Math.min(255, Math.max(0, parseInt(raw, 16) + amount));
    return value.toString(16).padStart(2, '0');
  };
  return `#${channel(m[1]!)}${channel(m[2]!)}${channel(m[3]!)}`;
}

/** Noir ou blanc, selon ce qui se lit sur le fond. */
export function readable(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((c) => parseInt(c, 16) / 255) as [
    number,
    number,
    number,
  ];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? '#10131c' : '#ffffff';
}
