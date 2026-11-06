/** Le scorebug. Le widget qui est à l'antenne en permanence. */
import { clockLabel } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
export const scorebug = () => {
    const homeName = h('span', {}, ['—']);
    const awayName = h('span', {}, ['—']);
    const homeRed = h('i', { class: 'scorebug__red', hidden: '' });
    const awayRed = h('i', { class: 'scorebug__red', hidden: '' });
    const score = h('span', {}, ['0 – 0']);
    const clockMain = h('span', {}, ['0:00']);
    const clockAdded = h('span', { class: 'scorebug__added' });
    const el = h('div', { class: 'scorebug' }, [
        h('i', { class: 'scorebug__bar scorebug__bar--home' }),
        h('div', { class: 'scorebug__team' }, [homeName, homeRed]),
        h('div', { class: 'scorebug__score' }, [score]),
        h('div', { class: 'scorebug__team scorebug__team--away' }, [awayRed, awayName]),
        h('i', { class: 'scorebug__bar scorebug__bar--away' }),
        h('div', { class: 'scorebug__clock' }, [clockMain, clockAdded]),
    ]);
    return {
        el,
        update({ state, clockMs }) {
            // Pas de métadonnées = on affiche des tirets, pas « undefined ».
            setText(homeName, state.meta?.home.abbr ?? '—');
            setText(awayName, state.meta?.away.abbr ?? '—');
            setText(score, `${state.score[0]} – ${state.score[1]}`);
            const label = clockLabel(clockMs, state.phase, state.clock.addedMinutes);
            setText(clockMain, label.main);
            setText(clockAdded, label.added ?? '');
            toggle(homeRed, state.stats.redCards[0] > 0);
            toggle(awayRed, state.stats.redCards[1] > 0);
        },
    };
};
function toggle(el, on) {
    if (on)
        el.removeAttribute('hidden');
    else
        setAttr(el, 'hidden', '');
}
