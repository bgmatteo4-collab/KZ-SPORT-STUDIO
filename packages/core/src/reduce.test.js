/**
 * Les invariants du réducteur.
 *
 * C'est la pièce dont tout dépend : si elle se trompe, l'antenne se trompe, et
 * personne ne s'en aperçoit avant que ce soit à l'écran. Chaque test ici
 * correspond à une façon connue de se planter en direct.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, StateCursor } from './reduce.js';
const T0 = 1_700_000_000_000;
/** Fabrique un événement sans répéter seq et t partout. */
let seq = 0;
function ev(tOffset, kind, payload) {
    return { seq: seq++, t: T0 + tOffset, kind, payload };
}
function matchDeBase() {
    seq = 0;
    return [
        ev(0, 'phase', { phase: 'first_half' }),
        ev(0, 'clock', { matchMs: 0, running: true, phase: 'first_half' }),
        ev(60_000, 'shot', { side: 'home', onTarget: true, xg: 0.2 }),
        ev(120_000, 'goal', { side: 'home', score: [1, 0] }),
        ev(180_000, 'card', { side: 'away', card: 'yellow' }),
        ev(240_000, 'goal', { side: 'away', score: [1, 1] }),
    ];
}
test('le score vient du fournisseur, il n’est jamais compté', () => {
    const events = matchDeBase();
    const etat = reduce(events, T0 + 300_000);
    assert.deepEqual(etat.score, [1, 1]);
    // Un but annulé par la VAR : le fournisseur renvoie le score corrigé. Si on
    // comptait les buts nous-mêmes, l'écart serait définitif.
    const avecVar = [...events, ev(260_000, 'score', { score: [1, 0] })];
    assert.deepEqual(reduce(avecVar, T0 + 300_000).score, [1, 0]);
    // Le but reste dans la liste des faits : c'est au rendu de décider.
    assert.equal(reduce(avecVar, T0 + 300_000).goals.length, 2);
});
test('un événement postérieur à l’instant demandé est ignoré', () => {
    const events = matchDeBase();
    // C'est TOUT le décalage anti-spoiler : à t, on ne voit rien de ce qui suit.
    const avant = reduce(events, T0 + 150_000);
    assert.deepEqual(avant.score, [1, 0]);
    assert.equal(avant.cards.length, 0);
    assert.equal(avant.goals.length, 1);
});
test('replier deux fois donne exactement le même état', () => {
    const events = matchDeBase();
    const a = reduce(events, T0 + 200_000);
    const b = reduce(events, T0 + 200_000);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});
test('filtrer les événements futurs ne change rien au résultat', () => {
    const events = matchDeBase();
    const t = T0 + 150_000;
    const complet = reduce(events, t);
    const filtre = reduce(events.filter((e) => e.t <= t), t);
    assert.deepEqual(JSON.parse(JSON.stringify(complet)), JSON.parse(JSON.stringify(filtre)));
});
test('le curseur incrémental dit la même chose que le repli complet', () => {
    const events = matchDeBase();
    const curseur = new StateCursor();
    curseur.replace(events);
    for (const t of [0, 60_000, 130_000, 190_000, 250_000, 400_000]) {
        const incremental = JSON.parse(JSON.stringify(curseur.at(T0 + t)));
        const complet = JSON.parse(JSON.stringify(reduce(events, T0 + t)));
        assert.deepEqual(incremental, complet, `divergence à t+${t}`);
    }
});
test('reculer dans le temps replie à neuf au lieu de garder l’état d’avant', () => {
    // C'est ce qui se passe quand on augmente le décalage anti-spoiler en direct.
    const events = matchDeBase();
    const curseur = new StateCursor();
    curseur.replace(events);
    curseur.at(T0 + 300_000);
    const recule = JSON.parse(JSON.stringify(curseur.at(T0 + 100_000)));
    assert.deepEqual(recule.score, [0, 0]);
    assert.equal(recule.goals.length, 0);
    assert.deepEqual(recule, JSON.parse(JSON.stringify(reduce(events, T0 + 100_000))));
});
test('ingérer deux fois les mêmes événements ne change rien', () => {
    const events = matchDeBase();
    const curseur = new StateCursor();
    assert.equal(curseur.ingest(events), events.length);
    assert.equal(curseur.ingest(events), 0, 'les doublons doivent être rejetés par seq');
    assert.equal(curseur.size, events.length);
});
test('un événement arrivé en retard est réinséré à sa place', () => {
    // Le réseau ne garantit pas l'ordre : un but peut arriver après un carton
    // qui lui est postérieur. Le résultat doit être celui de l'ordre des `t`.
    const events = matchDeBase();
    const curseur = new StateCursor();
    const [enRetard, ...reste] = events;
    curseur.replace(reste);
    curseur.at(T0 + 300_000);
    curseur.ingest([enRetard]);
    assert.deepEqual(JSON.parse(JSON.stringify(curseur.at(T0 + 300_000))), JSON.parse(JSON.stringify(reduce(events, T0 + 300_000))));
});
test('les statistiques ne se cumulent pas deux fois sur un repli', () => {
    const events = matchDeBase();
    const curseur = new StateCursor();
    curseur.replace(events);
    const premier = curseur.at(T0 + 300_000).stats.shots[0];
    curseur.at(T0 + 10_000);
    const second = curseur.at(T0 + 300_000).stats.shots[0];
    assert.equal(premier, 1);
    assert.equal(second, 1, 'un repli ne doit pas recompter les tirs');
});
test('sans métadonnées, l’état reste exploitable', () => {
    // Règle n°6 : pas de donnée, pas d'affichage — mais jamais d'erreur.
    const etat = reduce([], T0);
    assert.equal(etat.meta, null);
    assert.deepEqual(etat.score, [0, 0]);
    assert.deepEqual(etat.ball, { x: 0.5, y: 0.5 });
    assert.equal(etat.goals.length, 0);
    assert.equal(etat.standings.length, 0);
});
test('la pression décroît avec le temps au lieu de s’accumuler', () => {
    seq = 0;
    const events = [
        ev(0, 'clock', { matchMs: 0, running: true, phase: 'first_half' }),
        ev(1000, 'shot', { side: 'home', onTarget: true, xg: 0.3 }),
    ];
    const juste = reduce(events, T0 + 2_000).pressure.home;
    const plusTard = reduce(events, T0 + 5 * 60_000).pressure.home;
    assert.ok(juste > 0, 'un tir doit produire de la pression');
    assert.ok(plusTard < juste / 2, 'elle doit avoir nettement décru après cinq minutes');
});
