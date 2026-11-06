/**
 * Les invariants du chrono.
 *
 * Un chrono qui saute ou qui recule se voit immédiatement à l'antenne, et
 * c'est précisément ce qui ruinait les premières versions du projet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClockSync, clockLabel, matchClockAt, minuteLabel, SmoothClock } from './clock.js';
const MIN = 60_000;
const T0 = 1_700_000_000_000;
const ancrage = (matchMs, running = true, phase = 'first_half') => ({
    wallMs: T0,
    matchMs,
    running,
    phase,
    addedMinutes: 0,
});
test('le chrono avance entre deux ancrages', () => {
    // Le fournisseur n'annonce la minute que toutes les 15 à 30 secondes : entre
    // deux annonces, c'est l'interpolation qui tient l'antenne.
    const c = ancrage(20 * MIN);
    assert.equal(matchClockAt(c, T0), 20 * MIN);
    assert.equal(matchClockAt(c, T0 + 7_000), 20 * MIN + 7_000);
});
test('un chrono arrêté ne bouge pas', () => {
    const c = ancrage(45 * MIN, false, 'half_time');
    assert.equal(matchClockAt(c, T0 + 10 * MIN), 45 * MIN);
});
test('le chrono ne devient jamais négatif', () => {
    const c = ancrage(5_000);
    assert.equal(matchClockAt(c, T0 - 60_000), 0);
});
test('le temps additionnel fige la minute réglementaire et compte à côté', () => {
    // Convention télé : à 45+2, on n'affiche pas 47:00.
    const a = clockLabel(45 * MIN + 95_000, 'first_half');
    assert.equal(a.main, '45:00');
    assert.equal(a.added, '+2');
    const b = clockLabel(90 * MIN + 10_000, 'second_half');
    assert.equal(b.main, '90:00');
    assert.equal(b.added, '+1');
});
test('hors jeu courant, le chrono cède la place à la période', () => {
    assert.equal(clockLabel(45 * MIN, 'half_time').main, 'MT');
    assert.equal(clockLabel(90 * MIN, 'full_time').main, 'FIN');
    assert.equal(clockLabel(0, 'pre').main, '0:00');
});
test('la minute d’un fait suit la convention du football', () => {
    // 23 min 14 s se note 24' : on compte la minute en cours, pas celle écoulée.
    assert.equal(minuteLabel(23 * MIN + 14_000, 'first_half'), '24');
    assert.equal(minuteLabel(0, 'first_half'), '1');
    assert.equal(minuteLabel(45 * MIN + 61_000, 'first_half'), '45+2');
    assert.equal(minuteLabel(93 * MIN + 51_000, 'second_half'), '90+4');
});
test('le chrono affiché ne recule jamais dans une même période', () => {
    const horloge = new SmoothClock();
    horloge.reset(20 * MIN, 'first_half', 0);
    let precedent = horloge.value;
    // On lui envoie exprès une cible qui recule légèrement, comme le ferait un
    // ancrage en retard.
    for (let i = 1; i <= 40; i += 1) {
        const cible = 20 * MIN + i * 1_000 - (i % 5 === 0 ? 800 : 0);
        const valeur = horloge.tick(cible, 'first_half', i * 1_000);
        assert.ok(valeur >= precedent, `recul à l'itération ${i} : ${valeur} < ${precedent}`);
        precedent = valeur;
    }
});
test('un écart important est une correction d’arbitrage, pas un lissage', () => {
    const horloge = new SmoothClock();
    horloge.reset(20 * MIN, 'first_half', 0);
    // L'arbitre arrête le jeu cinq minutes : on ne lisse pas, on recale.
    const valeur = horloge.tick(25 * MIN, 'first_half', 1_000);
    assert.equal(valeur, 25 * MIN);
});
test('un changement de période recale sans transition', () => {
    const horloge = new SmoothClock();
    horloge.reset(47 * MIN, 'first_half', 0);
    assert.equal(horloge.tick(45 * MIN, 'half_time', 1_000), 45 * MIN);
});
test('le calage d’horloge tient compte de la vitesse de rejeu', () => {
    const sync = new ClockSync();
    const local = Date.now();
    sync.sample(local - 20, local + 5_000, local);
    const base = sync.now();
    assert.ok(Math.abs(base - (local + 5_000)) < 60, 'l’heure serveur doit être retrouvée');
    // À x20, l'horloge du client doit avancer vingt fois plus vite, sinon
    // l'affichage prend du retard sur les événements reçus.
    sync.setScale(20);
    assert.equal(sync.currentScale, 20);
});
test('une mesure anormalement lente ne pollue pas le calage', () => {
    const sync = new ClockSync();
    const local = Date.now();
    for (let i = 0; i < 5; i += 1)
        sync.sample(local - 20, local + 1_000, local);
    const avant = sync.currentOffset;
    // Un aller-retour de deux secondes : la médiane doit l'absorber.
    sync.sample(local - 2_000, local + 9_000, local);
    assert.ok(Math.abs(sync.currentOffset - avant) < 200, 'la médiane doit amortir l’aberration');
});
