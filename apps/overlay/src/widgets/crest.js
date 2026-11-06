/**
 * Écus et maillots, dessinés à partir des couleurs de l'équipe.
 *
 * Choix assumé : on n'embarque aucun logo de club. Les écus officiels sont des
 * marques déposées, et un dépôt qui les contient n'est pas distribuable. On
 * dessine donc un écu à partir du trigramme et des couleurs — à l'antenne, dans
 * un panneau de 24 px, la différence ne se voit pas, et le jour où tu as des
 * fichiers sous licence, seule cette fonction change.
 */
import { h } from '../dom.js';
const NS = 'http://www.w3.org/2000/svg';
export function crestEl(extraClass = '') {
    const el = h('div', { class: `crest ${extraClass}`.trim() });
    el.textContent = '';
    return el;
}
export function paintCrest(el, team) {
    if (!team) {
        el.style.background = 'var(--pill)';
        if (el.textContent !== '')
            el.textContent = '';
        return;
    }
    const alt = team.colorAlt ?? shade(team.color, -28);
    const background = `linear-gradient(160deg, ${team.color} 0%, ${alt} 100%)`;
    if (el.style.background !== background)
        el.style.background = background;
    el.style.color = readable(team.color);
    if (el.textContent !== team.abbr)
        el.textContent = team.abbr;
}
/**
 * Un maillot.
 *
 * Pas un pictogramme : une silhouette avec col, manches et ombrage, dans les
 * couleurs du club, avec un écu sur la poitrine. Le gardien porte une autre
 * couleur et son numéro — c'est la convention d'antenne, et c'est ce qui fait
 * qu'on lit une composition au lieu de déchiffrer une grille d'icônes.
 */
export function jerseyEl(team, keeper = false, number) {
    const wrap = h('div', { class: 'jersey' });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 46');
    const base = keeper ? '#2fd07a' : (team?.color ?? '#6b7280');
    const second = keeper ? '#1a9b55' : (team?.colorAlt ?? shade(base, -38));
    const kit = keeper ? 'plain' : (team?.kit ?? 'plain');
    const id = Math.random().toString(36).slice(2, 8);
    // Corps : épaules, manches courtes, buste, et l'échancrure du col.
    const SHIRT = 'M17 4 L11 6 L3 11 L8 20 L14 16.5 L14 43 L34 43 L34 16.5 L40 20 L45 11 L37 6 L31 4 ' +
        'C29.5 8.5 18.5 8.5 17 4 Z';
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
        for (let x = 14; x < 34; x += 7)
            motif.append(bar(x, 0, 3.5, 46, second));
    }
    else if (kit === 'hoops') {
        for (let y = 10; y < 44; y += 8)
            motif.append(bar(0, y, 48, 4, second));
    }
    else {
        // Uni : manches dans la seconde couleur. Suffit à identifier l'équipe sans
        // inventer un maillot qui n'existe pas.
        motif.append(bar(2, 4, 12, 18, second), bar(34, 4, 12, 18, second));
    }
    // Ombrage : un dégradé sombre vers le bas, c'est ce qui donne le volume.
    const grad = document.createElementNS(NS, 'linearGradient');
    grad.setAttribute('id', `g${id}`);
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0');
    grad.setAttribute('y2', '1');
    for (const [offset, color, opacity] of [
        ['0%', '#ffffff', '0.26'],
        ['46%', '#ffffff', '0'],
        ['100%', '#000000', '0.3'],
    ]) {
        const stop = document.createElementNS(NS, 'stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        stop.setAttribute('stop-opacity', opacity);
        grad.append(stop);
    }
    const shade_ = shape();
    shade_.setAttribute('fill', `url(#g${id})`);
    const outline = shape();
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', 'rgba(0,0,0,0.5)');
    outline.setAttribute('stroke-width', '1.4');
    outline.setAttribute('stroke-linejoin', 'round');
    svg.append(grad, clip, body, motif, shade_, outline);
    // L'écu sur la poitrine. Le gardien porte son numéro à la place.
    if (keeper && number !== undefined) {
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', '24');
        text.setAttribute('y', '30');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '15');
        text.setAttribute('font-weight', '800');
        text.setAttribute('font-family', 'Archivo, sans-serif');
        text.setAttribute('fill', readable(base));
        text.textContent = String(number);
        svg.append(text);
    }
    else {
        const badge = document.createElementNS(NS, 'circle');
        badge.setAttribute('cx', '24');
        badge.setAttribute('cy', '24');
        badge.setAttribute('r', '3.6');
        badge.setAttribute('fill', 'rgba(255,255,255,0.82)');
        badge.setAttribute('stroke', 'rgba(0,0,0,0.3)');
        badge.setAttribute('stroke-width', '0.8');
        svg.append(badge);
    }
    wrap.append(svg);
    return wrap;
}
function bar(x, y, w, h, fill) {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', fill);
    return rect;
}
/** Éclaircit (positif) ou assombrit (négatif) une couleur hexadécimale. */
export function shade(hex, amount) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!m)
        return hex;
    const channel = (raw) => {
        const value = Math.min(255, Math.max(0, parseInt(raw, 16) + amount));
        return value.toString(16).padStart(2, '0');
    };
    return `#${channel(m[1])}${channel(m[2])}${channel(m[3])}`;
}
/** Noir ou blanc, selon ce qui se lit sur le fond. */
export function readable(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!m)
        return '#fff';
    const [r, g, b] = [m[1], m[2], m[3]].map((c) => parseInt(c, 16) / 255);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.62 ? '#10131c' : '#ffffff';
}
