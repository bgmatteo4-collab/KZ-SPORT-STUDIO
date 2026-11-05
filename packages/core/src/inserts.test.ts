/**
 * Les invariants de la régie automatique.
 *
 * Le déterminisme n'est pas un détail d'élégance ici : les deux sources
 * navigateur d'OBS sont deux navigateurs séparés. Si le choix d'insert
 * dépendait du hasard ou de l'heure locale, elles afficheraient deux panneaux
 * différents au même instant, et personne ne comprendrait pourquoi.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { insertActif, INSERTS } from './inserts.js';
import { reduce } from './reduce.js';
import type { MatchEvent, Pair } from './types.js';

const T0 = 1_700_000_000_000;
const SEC = 1_000;
const MIN = 60 * SEC;

let seq = 0;
function ev<K extends MatchEvent['kind']>(
  tOffset: number,
  kind: K,
  payload: Extract<MatchEvent, { kind: K }>['payload'],
): MatchEvent {
  return { seq: seq++, t: T0 + tOffset, kind, payload } as MatchEvent;
}

function match(): MatchEvent[] {
  seq = 0;
  return [
    ev(0, 'phase', { phase: 'first_half' }),
    ev(0, 'clock', { matchMs: 0, running: true, phase: 'first_half' }),
    ev(10 * MIN, 'goal', { side: 'home', score: [1, 0] as Pair }),
    ev(22 * MIN, 'card', { side: 'away', card: 'red' }),
  ];
}

const etatA = (t: number) => reduce(match(), T0 + t);

test('le même instant donne toujours le même insert', () => {
  // La garantie qui permet aux deux couches d'OBS de s'accorder.
  for (const t of [3 * MIN, 10 * MIN + 20 * SEC, 24 * MIN, 41 * MIN]) {
    const a = insertActif(etatA(t), T0 + t);
    const b = insertActif(etatA(t), T0 + t);
    assert.deepEqual(a, b, `divergence à t+${t / MIN} min`);
  }
});

test('rien ne s’insère pendant qu’un carton de but est à l’antenne', () => {
  // Le carton plein écran a la priorité ; superposer les deux ferait désordre.
  const juste = insertActif(etatA(10 * MIN + 2 * SEC), T0 + 10 * MIN + 2 * SEC);
  assert.equal(juste, null);
});

test('un insert motivé suit le but, une fois le carton sorti', () => {
  const t = 10 * MIN + 16 * SEC;
  const actif = insertActif(etatA(t), T0 + t);
  assert.ok(actif, 'un insert doit venir après le but');
  assert.match(actif.motif, /après le but/);
});

test('un carton rouge appelle le momentum : le match vient de changer', () => {
  const t = 22 * MIN + 10 * SEC;
  const actif = insertActif(etatA(t), T0 + t);
  assert.ok(actif);
  assert.match(actif.motif, /carton rouge/);
  assert.equal(actif.spec.widget, 'momentum');
});

test('un insert motivé prime sur le fond de roulement', () => {
  // À 10 min, une frontière de rotation est proche ; le but doit gagner.
  const t = 10 * MIN + 16 * SEC;
  const actif = insertActif(etatA(t), T0 + t);
  assert.ok(actif);
  assert.notEqual(actif.motif, 'temps mort');
});

test('l’insert finit par sortir', () => {
  const debut = 10 * MIN + 16 * SEC;
  const actif = insertActif(etatA(debut), T0 + debut);
  assert.ok(actif);
  const apres = actif.to - T0 + SEC;
  const fini = insertActif(etatA(apres), T0 + apres);
  assert.notDeepEqual(fini, actif, 'il doit avoir rendu la place');
});

test('hors jeu courant, aucun insert', () => {
  // À la mi-temps ou avant le coup d'envoi, les scènes dédiées prennent le
  // relais : un insert qui surgirait là n'aurait aucun sens.
  for (const phase of ['pre', 'half_time', 'full_time'] as const) {
    seq = 0;
    const events = [
      ev(0, 'phase', { phase }),
      ev(0, 'clock', { matchMs: 45 * MIN, running: false, phase }),
    ];
    const t = 50 * MIN;
    assert.equal(insertActif(reduce(events, T0 + t), T0 + t), null, phase);
  }
});

test('la rotation ne répète pas deux fois de suite le même panneau', () => {
  // Deux frontières consécutives doivent montrer deux choses différentes,
  // sinon on a l'impression que rien ne change.
  seq = 0;
  const events = [
    ev(0, 'phase', { phase: 'first_half' }),
    ev(0, 'clock', { matchMs: 0, running: true, phase: 'first_half' }),
  ];
  const vus: string[] = [];
  for (const t of [2 * MIN + SEC, 4 * MIN + SEC, 6 * MIN + SEC, 8 * MIN + SEC]) {
    const actif = insertActif(reduce(events, T0 + t), T0 + t);
    if (actif) vus.push(actif.spec.id);
  }
  assert.ok(vus.length >= 3, `trop peu d'inserts vus : ${vus.join(', ')}`);
  for (let i = 1; i < vus.length; i += 1) {
    assert.notEqual(vus[i], vus[i - 1], `répétition : ${vus.join(' → ')}`);
  }
});

test('tout insert désigne un widget du catalogue', () => {
  const connus = new Set(INSERTS.map((i) => i.widget));
  for (let t = MIN; t < 40 * MIN; t += 17 * SEC) {
    const actif = insertActif(etatA(t), T0 + t);
    if (actif) assert.ok(connus.has(actif.spec.widget), actif.spec.widget);
  }
});
