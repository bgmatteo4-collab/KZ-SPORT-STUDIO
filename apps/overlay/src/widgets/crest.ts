/**
 * Écus et maillots, dessinés à partir des couleurs de l'équipe.
 *
 * Choix assumé : on n'embarque aucun logo de club. Les écus officiels sont des
 * marques déposées, et un dépôt qui les contient n'est pas distribuable. On
 * dessine donc un écu à partir du trigramme et des couleurs — à l'antenne, dans
 * un panneau de 24 px, la différence ne se voit pas, et le jour où tu as des
 * fichiers sous licence, seule cette fonction change.
 */

import { ecuLocal, type Team, type TeamBrief } from '@kz/core';
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
    poser(el, '', undefined, 'var(--pill)');
    return;
  }
  const alt = team.colorAlt ?? shade(team.color, -28);
  // Quand un VRAI écusson a chargé, la plaque disparaît : plus de fond, plus
  // de contour, plus de forme de blason. Un logo de club est déjà un écusson —
  // l'enfermer dans un second cadre fait doublon et ça se voit tout de suite.
  // L'écu dessiné ne sert que tant qu'on n'a pas l'image.
  const plaque = `linear-gradient(160deg, ${team.color} 0%, ${alt} 100%)`;
  const avecLogo = el.getAttribute('data-logo') === '1';
  const background = avecLogo ? 'transparent' : plaque;
  if (el.style.background !== background) el.style.background = background;
  el.style.color = readable(team.color);
  // On passe par notre serveur : il garde les écussons, donc l'antenne ne
  // dépend plus d'un CDN tiers une fois la première image reçue.
  poser(el, team.abbr, ecuLocal(team.crest), plaque);
}

/**
 * Le trigramme, et par-dessus le vrai écusson quand on en a l'adresse.
 *
 * Aucun logo n'est rangé dans le dépôt : l'URL vient de la donnée en direct,
 * donc rien de déposé n'est redistribué. Et si l'image ne charge pas — hors
 * ligne, 404, réseau coupé en pleine émission — elle se retire et l'écu dessiné
 * reste dessous. Le plateau ne montre jamais un trou.
 *
 * ── Le bogue que `plaque` corrige ───────────────────────────────────────────
 *
 * La plaque dessinée n'était effacée qu'au PASSAGE SUIVANT de `paintCrest` :
 * on marquait `data-logo` à la fin du chargement, et c'est le prochain appel
 * qui lisait ce drapeau pour mettre le fond en transparent.
 *
 * Ça marchait sur la bannière de score, qui se repeint à chaque image. Ça ne
 * marchait PAS sur le classement ni sur le multiplex, qui ne se reconstruisent
 * qu'au changement de données : un logo transparent y restait posé sur un
 * dégradé aux couleurs du club, c'est-à-dire exactement le vilain contour
 * coloré qu'on croyait avoir supprimé.
 *
 * Le fond est donc remis à sa valeur AU MOMENT où l'image arrive — ou échoue.
 * C'est le seul instant où l'on sait vraiment ce qu'il faut afficher.
 */
/**
 * Les écussons déjà chargés une fois dans cette page.
 *
 * ── Le clignotement que ça supprime ────────────────────────────────────────
 *
 * Les listes se reconstruisent — le multiplex dès qu'une minute avance,
 * c'est-à-dire sans arrêt. Chaque reconstruction fabriquait un `<img>` neuf,
 * et `load` est asynchrone MÊME quand l'image est déjà dans le cache du
 * navigateur : pendant une image ou deux, les vingt lignes montraient donc la
 * plaque dessinée avant que le vrai écusson ne la remplace. Vingt logos qui
 * battent une fois par minute, c'est exactement le « tout change brusquement »
 * qu'on cherche à faire disparaître.
 *
 * Une URL qui a déjà chargé une fois charge toujours : on pose donc l'état
 * final tout de suite, et `load` ne fait plus que confirmer. En cas d'échec,
 * l'URL sort de la liste et on repasse par la plaque.
 */
const DEJA_CHARGEES = new Set<string>();

function poser(
  el: HTMLElement,
  abbr: string,
  url: string | undefined,
  plaque: string,
): void {
  let label = el.querySelector<HTMLElement>('.crest__abbr');
  if (!label) {
    el.textContent = '';
    label = h('span', { class: 'crest__abbr' });
    el.append(label);
  }
  if (label.textContent !== abbr) label.textContent = abbr;

  const img = el.querySelector<HTMLImageElement>('.crest__img');
  if (!url) {
    if (img) img.remove();
    el.removeAttribute('data-logo');
    return;
  }
  if (img) {
    if (img.getAttribute('src') !== url) {
      el.removeAttribute('data-logo');
      el.style.background = plaque;
      img.setAttribute('src', url);
    }
    return;
  }
  const n = document.createElement('img');
  n.className = 'crest__img';
  n.alt = '';
  n.decoding = 'async';
  if (DEJA_CHARGEES.has(url)) {
    el.setAttribute('data-logo', '1');
    el.style.background = 'transparent';
  }
  n.addEventListener('load', () => {
    DEJA_CHARGEES.add(url);
    el.setAttribute('data-logo', '1');
    el.style.background = 'transparent';
  });
  n.addEventListener('error', () => {
    DEJA_CHARGEES.delete(url);
    n.remove();
    el.removeAttribute('data-logo');
    el.style.background = plaque;
  });
  n.setAttribute('src', url);
  el.append(n);
}

/**
 * Un maillot.
 *
 * Pas un pictogramme : une silhouette avec col, manches et ombrage, dans les
 * couleurs du club, avec un écu sur la poitrine. Le gardien porte une autre
 * couleur et son numéro — c'est la convention d'antenne, et c'est ce qui fait
 * qu'on lit une composition au lieu de déchiffrer une grille d'icônes.
 */
export function jerseyEl(
  team: AnyTeam | undefined,
  keeper = false,
  number?: number,
  options: { aMarque?: boolean } = {},
): HTMLElement {
  const wrap = h('div', { class: 'jersey' });
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 56 54');

  const base = keeper ? '#2fd07a' : (team?.color ?? '#6b7280');
  const second = keeper ? '#1a9b55' : (team?.colorAlt ?? shade(base, -38));
  const kit = keeper ? 'plain' : (team?.kit ?? 'plain');
  const id = Math.random().toString(36).slice(2, 8);

  /*
   * ── Pourquoi ce maillot a été redessiné ───────────────────────────────
   *
   * Le précédent était étroit — vingt unités de buste sur quarante-huit de
   * large — avec des manches courtes et droites. À l'écran il ne ressemblait
   * pas à un maillot mais à un pictogramme d'interface : c'est exactement ce
   * qu'on reproche à un habillage fait « en CSS ».
   *
   * Celui-ci a les épaules larges, des manches qui tombent, un buste qui
   * s'évase légèrement vers le bas et un col arrondi. Et surtout il porte le
   * NUMÉRO du joueur, comme un vrai maillot : c'est ce détail-là qui fait
   * basculer la lecture d'icône à vêtement.
   */
  const SHIRT =
    'M19 3 L10 6 L1 15 L9 26 L16 21 L16 51 ' +
    'C16 52.2 16.8 53 18 53 L38 53 C39.2 53 40 52.2 40 51 L40 21 L47 26 L55 15 L46 6 L37 3 ' +
    'C35 9.6 21 9.6 19 3 Z';

  const shape = () => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', SHIRT);
    return path;
  };

  const clip = document.createElementNS(NS, 'clipPath');
  clip.setAttribute('id', `k${id}`);
  clip.append(shape());

  const body = shape();
  body.setAttribute('fill', base);

  const motif = document.createElementNS(NS, 'g');
  motif.setAttribute('clip-path', `url(#k${id})`);
  if (kit === 'striped') {
    for (let x = 16; x < 40; x += 8) motif.append(bar(x, 0, 4, 54, second));
  } else if (kit === 'hoops') {
    for (let y = 12; y < 52; y += 9) motif.append(bar(0, y, 56, 4.5, second));
  } else {
    // Uni : manches dans la seconde couleur. Suffit à identifier l'équipe sans
    // inventer un maillot qui n'existe pas.
    motif.append(bar(1, 4, 15, 22, second), bar(40, 4, 15, 22, second));
  }

  // Ombrage : un dégradé sombre vers le bas, c'est ce qui donne le volume.
  const grad = document.createElementNS(NS, 'linearGradient');
  grad.setAttribute('id', `g${id}`);
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', '1');
  for (const [offset, color, opacity] of [
    ['0%', '#ffffff', '0.28'],
    ['44%', '#ffffff', '0'],
    ['100%', '#000000', '0.34'],
  ] as const) {
    const stop = document.createElementNS(NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    stop.setAttribute('stop-opacity', opacity);
    grad.append(stop);
  }
  const shade_ = shape();
  shade_.setAttribute('fill', `url(#g${id})`);

  // Le col, en creux : deux traits suffisent à poser le vêtement.
  const col = document.createElementNS(NS, 'path');
  col.setAttribute('d', 'M19 3 C21 9.6 35 9.6 37 3');
  col.setAttribute('fill', 'none');
  col.setAttribute('stroke', 'rgba(0,0,0,0.34)');
  col.setAttribute('stroke-width', '2.2');

  const outline = shape();
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'rgba(0,0,0,0.55)');
  outline.setAttribute('stroke-width', '1.6');
  outline.setAttribute('stroke-linejoin', 'round');

  svg.append(grad, clip, body, motif, shade_, col, outline);

  // Le numéro, sur la poitrine — pour TOUT LE MONDE, pas seulement le
  // gardien. C'est ce qui distingue un maillot d'un pictogramme.
  if (number !== undefined && number > 0) {
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', '28');
    text.setAttribute('y', '38');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '19');
    text.setAttribute('font-weight', '900');
    text.setAttribute('font-family', 'Rubik, sans-serif');
    text.setAttribute('fill', readable(base));
    text.setAttribute('opacity', '0.92');
    text.textContent = String(number);
    svg.append(text);
  }

  wrap.append(svg);

  /*
   * Le ballon du buteur.
   *
   * Savoir QUI a marqué en regardant la composition, c'est l'information que
   * le spectateur cherche en premier sur ce panneau, et elle n'y était nulle
   * part : il fallait aller lire la bannière. Une pastille suffit — elle se
   * lit à vingt pixels, là où un texte demanderait une ligne.
   */
  if (options.aMarque) {
    const ballon = h('i', { class: 'jersey__but' });
    ballon.title = 'a marqué';
    wrap.append(ballon);
  }

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
