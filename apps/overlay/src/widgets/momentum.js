/**
 * Le momentum : qui pousse, et depuis quand.
 *
 * Une barre coupée en deux ne dit que l'instant présent. Une courbe raconte le
 * match — on voit le temps fort, le retournement, l'équipe qui s'éteint. C'est
 * la donnée que `state.pressureLog` porte déjà et que je n'exploitais pas.
 *
 * Tout est calculé par le réducteur ; ici on ne fait que tracer.
 */
import { h, setText } from '../dom.js';
import { panel } from './panel.js';
/** Fenêtre tracée, en ms de jeu. */
const WINDOW = 12 * 60_000;
/** Résolution de la courbe. Plus que ça ne se voit pas à l'antenne. */
const STEPS = 72;
const HALF_LIFE = 2.5 * 60_000;
export const momentum = () => {
    const canvas = h('canvas', { class: 'momentum__canvas' });
    const homeName = h('span', { class: 'momentum__team' }, ['—']);
    const awayName = h('span', { class: 'momentum__team' }, ['—']);
    const homeShare = h('span', { class: 'momentum__share t-l' }, ['50%']);
    const awayShare = h('span', { class: 'momentum__share t-l' }, ['50%']);
    const box = panel({ icon: 'radar', kicker: '12 dernières minutes', title: 'Momentum' });
    box.body.append(h('div', { class: 'momentum' }, [
        h('div', { class: 'momentum__row' }, [homeName, homeShare]),
        h('div', { class: 'momentum__plot' }, [canvas]),
        h('div', { class: 'momentum__row' }, [awayName, awayShare]),
    ]));
    let sized = '';
    return {
        // Un canevas : il doit être repeint à chaque image.
        animated: true,
        el: box.el,
        update({ state, theme }) {
            setText(homeName, state.meta?.home.short ?? '—');
            setText(awayName, state.meta?.away.short ?? '—');
            const total = state.pressure.home + state.pressure.away;
            const share = total < 0.01 ? 0.5 : state.pressure.home / total;
            setText(homeShare, `${Math.round(share * 100)}%`);
            setText(awayShare, `${Math.round((1 - share) * 100)}%`);
            const context = canvas.getContext('2d');
            if (!context)
                return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0)
                return;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const key = `${Math.round(rect.width)}x${Math.round(rect.height)}@${dpr}`;
            if (sized !== key) {
                canvas.width = Math.round(rect.width * dpr);
                canvas.height = Math.round(rect.height * dpr);
                sized = key;
            }
            draw(context, canvas.width, canvas.height, state, theme.tokens);
        },
    };
};
/** La pression de chaque camp à l'instant `at`, décroissance exponentielle. */
function pressureAt(state, at) {
    let home = 0;
    let away = 0;
    for (let i = state.pressureLog.length - 1; i >= 0; i -= 1) {
        const sample = state.pressureLog[i];
        const age = at - sample.t;
        if (age < 0)
            continue;
        if (age > WINDOW)
            break;
        const decayed = sample.weight * Math.pow(0.5, age / HALF_LIFE);
        if (sample.side === 'home')
            home += decayed;
        else
            away += decayed;
    }
    return { home, away };
}
function draw(c, w, h, state, tokens) {
    c.clearRect(0, 0, w, h);
    const mid = h / 2;
    const from = state.t - WINDOW;
    // Ligne médiane : l'équilibre.
    c.strokeStyle = tokens.panelLine;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, mid);
    c.lineTo(w, mid);
    c.stroke();
    const points = [];
    for (let i = 0; i <= STEPS; i += 1) {
        const at = from + (WINDOW * i) / STEPS;
        const { home, away } = pressureAt(state, at);
        const total = home + away;
        // −1 (extérieur) … +1 (domicile)
        const bias = total < 0.01 ? 0 : (home - away) / total;
        points.push({ x: (w * i) / STEPS, y: mid - bias * mid * 0.92 });
    }
    // Les deux aires, de part et d'autre de la médiane.
    for (const [side, color] of [
        ['home', tokens.accent],
        ['away', tokens.live],
    ]) {
        c.beginPath();
        c.moveTo(0, mid);
        for (const p of points) {
            c.lineTo(p.x, side === 'home' ? Math.min(p.y, mid) : Math.max(p.y, mid));
        }
        c.lineTo(w, mid);
        c.closePath();
        c.fillStyle = color;
        c.globalAlpha = 0.26;
        c.fill();
        c.globalAlpha = 1;
    }
    // La courbe par-dessus.
    c.beginPath();
    points.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
    c.strokeStyle = '#fff';
    c.lineWidth = Math.max(2, h / 40);
    c.lineJoin = 'round';
    c.stroke();
    // Les buts : des repères verticaux sur la courbe.
    for (const goal of state.goals) {
        if (goal.t < from || goal.t > state.t)
            continue;
        const x = ((goal.t - from) / WINDOW) * w;
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, h);
        c.strokeStyle = tokens.inkDim;
        c.lineWidth = 1;
        c.setLineDash([4, 4]);
        c.stroke();
        c.setLineDash([]);
        c.beginPath();
        c.arc(x, goal.side === 'home' ? h * 0.16 : h * 0.84, Math.max(3, h / 26), 0, Math.PI * 2);
        c.fillStyle = '#fff';
        c.fill();
    }
}
