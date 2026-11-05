/**
 * Les invariants des déclenchements.
 *
 * Un seul défaut ici a une conséquence spectaculaire : recharger l'overlay en
 * fin de match rejouerait les six buts à l'antenne, l'un après l'autre.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reduce } from './reduce.js';
import { TriggerWatcher } from './triggers.js';
import type { MatchEvent, Pair } from './types.js';

const T0 = 1_700_000_000_000;

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
    ev(120_000, 'goal', { side: 'home', score: [1, 0] as Pair }),
    ev(180_000, 'card', { side: 'away', card: 'yellow' }),
    ev(240_000, 'substitution', { side: 'home' }),
    ev(300_000, 'goal', { side: 'away', score: [1, 1] as Pair }),
  ];
}

test('un fait ne se déclenche qu’une seule fois', () => {
  const events = match();
  const guetteur = new TriggerWatcher();
  guetteur.prime(reduce(events, T0));

  const apresPremierBut = guetteur.poll(reduce(events, T0 + 130_000));
  assert.equal(apresPremierBut.length, 1);
  assert.equal(apresPremierBut[0]!.kind, 'goal');

  // Deuxième appel au même instant : plus rien, le fait est déjà passé.
  assert.equal(guetteur.poll(reduce(events, T0 + 130_000)).length, 0);
});

test('réarmer ne rejoue rien — c’est le chemin du rechargement', () => {
  // Au rechargement, toute la timeline entre d'un coup dans le champ visible.
  // Sans réarmement, on rejouerait tous les buts du match à l'antenne.
  const events = match();
  const guetteur = new TriggerWatcher();
  const fin = reduce(events, T0 + 400_000);

  guetteur.prime(fin);
  assert.equal(guetteur.poll(fin).length, 0, 'un réarmement doit tout absorber');
});

test('augmenter le décalage REJOUE ce qui n’a pas encore été vu du stream', () => {
  // Contre-intuitif, mais c'est le comportement juste.
  //
  // L'opérateur augmente le décalage de deux minutes : l'instant rendu recule.
  // Un but qui venait de passer à l'antenne n'a, DU POINT DE VUE DU
  // SPECTATEUR, pas encore eu lieu — son stream montre maintenant deux minutes
  // plus tôt. Quand le but réapparaîtra, le carton doit se déclencher à
  // nouveau, sinon le spectateur voit le but sans l'habillage.
  const events = match();
  const guetteur = new TriggerWatcher();
  guetteur.prime(reduce(events, T0));

  const premierPassage = guetteur.poll(reduce(events, T0 + 400_000));
  assert.equal(premierPassage.length, 4);

  guetteur.prime(reduce(events, T0 + 100_000));
  const secondPassage = guetteur.poll(reduce(events, T0 + 400_000));
  assert.equal(secondPassage.length, 4, 'les faits doivent repasser à l’antenne');
});

test('diminuer le décalage n’envoie pas une rafale de cartons', () => {
  // Le cas inverse : l'instant rendu bondit en avant et plusieurs faits
  // entrent d'un coup dans le champ visible. Les rejouer tous à la suite
  // serait absurde — le réarmement les absorbe.
  const events = match();
  const guetteur = new TriggerWatcher();
  guetteur.prime(reduce(events, T0));
  guetteur.poll(reduce(events, T0 + 130_000));

  const enAvant = reduce(events, T0 + 400_000);
  guetteur.prime(enAvant);
  assert.equal(guetteur.poll(enAvant).length, 0);
});

test('chaque famille de fait est signalée', () => {
  const events = match();
  const guetteur = new TriggerWatcher();
  guetteur.prime(reduce(events, T0));

  const tous = guetteur.poll(reduce(events, T0 + 400_000));
  const familles = tous.map((t) => t.kind).sort();
  assert.deepEqual(familles, ['card', 'goal', 'goal', 'substitution']);
});

test('un changement de période est signalé une fois', () => {
  const events = [...match(), ev(360_000, 'phase', { phase: 'half_time' })];
  const guetteur = new TriggerWatcher();
  guetteur.prime(reduce(events, T0 + 100_000));

  const apres = guetteur.poll(reduce(events, T0 + 400_000));
  assert.equal(apres.filter((t) => t.kind === 'phase').length, 1);
  assert.equal(guetteur.poll(reduce(events, T0 + 400_000)).filter((t) => t.kind === 'phase').length, 0);
});

test('sans réarmement préalable, le premier appel ne déclenche pas la période', () => {
  // Au tout premier passage on ne connaît pas la période précédente : on ne
  // doit pas inventer un changement.
  const guetteur = new TriggerWatcher();
  const faits = guetteur.poll(reduce(match(), T0 + 10_000));
  assert.equal(faits.filter((t) => t.kind === 'phase').length, 0);
});
