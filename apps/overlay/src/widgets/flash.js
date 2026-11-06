/**
 * Les cartons plein écran : but, carton, remplacement.
 *
 * Toujours monté, quelle que soit la scène — une notification ne dépend pas du
 * décor. Il ne s'affiche que sur DÉCLENCHEMENT, jamais en lisant l'état : sinon
 * un rechargement rejouerait les six buts du match à l'antenne.
 */
import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
const HOLD_MS = 5_200;
export const flash = () => {
    const crest = crestEl('flash__crest');
    const kicker = h('div', { class: 'flash__kicker' }, ['']);
    const titleEl = h('div', { class: 'flash__title' }, ['']);
    const sub = h('div', { class: 'flash__sub' }, ['']);
    const card = h('div', { class: 'flash__card', 'data-kind': 'goal' }, [
        crest,
        h('div', { class: 'flash__text' }, [kicker, titleEl, sub]),
    ]);
    const el = h('div', { class: 'flash', 'data-on': '0' }, [card]);
    let hideAt = 0;
    return {
        el,
        update({ realNow }) {
            // Temps RÉEL : un carton doit tenir cinq secondes à l'écran, pas cinq
            // secondes de match — en rejeu accéléré ce serait un clignotement.
            if (hideAt !== 0 && realNow >= hideAt) {
                setAttr(el, 'data-on', '0');
                hideAt = 0;
            }
        },
        trigger(trigger, ctx) {
            const content = describe(trigger, ctx);
            if (!content)
                return;
            setAttr(card, 'data-kind', content.kind);
            paintCrest(crest, content.team);
            setText(kicker, content.kicker);
            setText(titleEl, content.title);
            setText(sub, content.sub);
            setAttr(el, 'data-on', '1');
            hideAt = ctx.realNow + HOLD_MS;
        },
    };
};
function describe(trigger, { state }) {
    const teamOf = (side) => side === 'home' ? state.meta?.home : state.meta?.away;
    switch (trigger.kind) {
        case 'goal': {
            const g = trigger.entry;
            const how = g.penalty ? ' sur penalty' : g.ownGoal ? ' contre son camp' : '';
            return {
                kind: 'goal',
                kicker: `But — ${teamOf(g.side)?.short ?? ''}`,
                title: g.scorer?.short ?? 'But',
                sub: `${g.minute}'${how}  ·  ${g.score[0]} – ${g.score[1]}` +
                    (g.assist ? `  ·  passe de ${g.assist.short}` : ''),
                ...(teamOf(g.side) ? { team: teamOf(g.side) } : {}),
            };
        }
        case 'card': {
            const c = trigger.entry;
            const red = c.card === 'red' || c.card === 'second_yellow';
            return {
                kind: red ? 'card-red' : 'card',
                kicker: red ? 'Carton rouge' : 'Carton jaune',
                title: c.player?.short ?? teamOf(c.side)?.short ?? '',
                sub: `${c.minute}'  ·  ${teamOf(c.side)?.short ?? ''}`,
                ...(teamOf(c.side) ? { team: teamOf(c.side) } : {}),
            };
        }
        case 'substitution': {
            const s = trigger.entry;
            if (!s.in && !s.out)
                return null;
            return {
                kind: 'sub',
                kicker: `Remplacement — ${teamOf(s.side)?.short ?? ''}`,
                title: s.in?.short ?? '',
                sub: `${s.minute}'  ·  sort : ${s.out?.short ?? '—'}`,
                ...(teamOf(s.side) ? { team: teamOf(s.side) } : {}),
            };
        }
        // Un changement de période ne mérite pas un plein écran.
        case 'phase':
            return null;
    }
}
