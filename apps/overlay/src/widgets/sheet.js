/**
 * La feuille de match : le fil chronologique de la rencontre.
 *
 * Disposition d'antenne : la minute au centre, les faits du domicile à gauche,
 * ceux de l'extérieur à droite. On lit la dynamique du match d'un coup d'œil —
 * une colonne qui se remplit d'un seul côté raconte une domination.
 */
import { h } from '../dom.js';
import { panel } from './panel.js';
export const sheet = () => {
    const box = panel({ icon: 'clock', kicker: 'Chronologie', title: 'Feuille de match', crests: 2 });
    const list = h('div', { class: 'sheet' });
    box.body.append(list);
    // `null` et non `''` : une liste vide produit la signature `''`, donc une
    // sentinelle vide empêcherait le widget de dessiner son état vide.
    let signature = null;
    return {
        el: box.el,
        update({ state }) {
            box.setCrests([state.meta?.home, state.meta?.away]);
            const rows = collect(state);
            const next = rows.map((r) => `${r.kind}${r.seq}`).join(',');
            if (next === signature)
                return;
            signature = next;
            list.replaceChildren();
            if (rows.length === 0) {
                list.append(h('div', { class: 'sheet__empty t-label' }, ['Aucun fait de jeu.']));
                return;
            }
            for (const row of rows) {
                const cell = h('div', { class: 'sheet__fact' }, [
                    h('i', { class: 'sheet__mark', 'data-kind': markOf(row) }),
                    h('span', { class: 'sheet__who' }, [who(row)]),
                    h('span', { class: 'sheet__what t-label' }, [what(row)]),
                ]);
                const line = h('div', { class: 'sheet__row', 'data-side': row.side }, [
                    row.side === 'home' ? cell : h('span'),
                    h('span', { class: 'sheet__minute' }, [`${row.entry.minute}'`]),
                    row.side === 'away' ? cell : h('span'),
                ]);
                list.append(line);
            }
        },
    };
};
function collect(state) {
    return [
        ...state.goals.map((entry) => ({
            t: entry.t, seq: entry.seq, side: entry.side, kind: 'goal', entry,
        })),
        ...state.cards.map((entry) => ({
            t: entry.t, seq: entry.seq, side: entry.side, kind: 'card', entry,
        })),
        ...state.subs.map((entry) => ({
            t: entry.t, seq: entry.seq, side: entry.side, kind: 'sub', entry,
        })),
    ].sort((a, b) => a.t - b.t || a.seq - b.seq);
}
function markOf(row) {
    if (row.kind === 'card')
        return row.entry.card === 'yellow' ? 'card' : 'card-red';
    return row.kind;
}
function who(row) {
    switch (row.kind) {
        case 'goal':
            return row.entry.ownGoal ? 'Contre son camp' : (row.entry.scorer?.short ?? 'But');
        case 'card':
            return row.entry.player?.short ?? '—';
        case 'sub':
            return row.entry.in?.short ?? '—';
    }
}
function what(row) {
    switch (row.kind) {
        case 'goal':
            if (row.entry.penalty)
                return 'But sur penalty';
            if (row.entry.ownGoal)
                return 'But contre son camp';
            return row.entry.assist ? `Passe de ${row.entry.assist.short}` : 'But';
        case 'card':
            return row.entry.card === 'yellow'
                ? 'Carton jaune'
                : row.entry.card === 'second_yellow'
                    ? 'Second jaune'
                    : 'Carton rouge';
        case 'sub':
            return `Sort : ${row.entry.out?.short ?? '—'}`;
    }
}
