/**
 * Le fil du match et le vocabulaire des faits.
 *
 * Deux choses sont vérifiées ici, et elles comptent autant l'une que l'autre :
 * que la géométrie dise la vérité (une distance fausse à l'antenne est une
 * affirmation fausse), et que le fil et la courbe de momentum restent
 * d'accord — c'est ce désaccord-là qui faisait monter la courbe sans qu'aucune
 * ligne à l'écran ne l'explique.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detailDuFait,
  distanceDuBut,
  estBut,
  estTir,
  type FaitEntry,
  type FaitKind,
  LIBELLE,
  LIBELLE_POUSSEE,
  POIDS,
  POIDS_POUSSEE,
  zoneDuTir,
} from './faits.js';
import { reduce } from './reduce.js';
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

function depart(): MatchEvent[] {
  seq = 0;
  return [
    ev(0, 'phase', { phase: 'first_half' }),
    ev(0, 'clock', { matchMs: 0, running: true, phase: 'first_half' }),
  ];
}

// ── La géométrie ─────────────────────────────────────────────────────────────

test('le point de penalty est bien à onze mètres', () => {
  // 11 m sur un terrain de 105 m, c'est 10,48 unités avant la ligne de but.
  const metres = distanceDuBut({ x: 100 - (11 / 105) * 100, y: 50 });
  assert.ok(metres !== null);
  assert.ok(Math.abs(metres - 11) < 0.01, `attendu ~11 m, obtenu ${metres}`);
});

test('la largeur compte autant que la longueur', () => {
  // Sur la ligne de but, à 20 unités de l'axe : 0,20 × 68 = 13,6 m.
  const metres = distanceDuBut({ x: 100, y: 70 });
  assert.ok(metres !== null);
  assert.ok(Math.abs(metres - 13.6) < 0.01, `attendu ~13,6 m, obtenu ${metres}`);
});

test('sans position, on ne dit rien plutôt que n’importe quoi', () => {
  assert.equal(distanceDuBut({ x: 80 }), null);
  assert.equal(distanceDuBut({ y: 50 }), null);
  assert.equal(zoneDuTir({}), null);
});

test('la surface est reconnue comme telle', () => {
  assert.match(zoneDuTir({ x: 90, y: 50 }) ?? '', /^dans la surface, dans l’axe$/);
  assert.match(zoneDuTir({ x: 90, y: 75 }) ?? '', /^dans la surface, très excentré$/);
});

test('hors de la surface, la distance est chiffrée', () => {
  const zone = zoneDuTir({ x: 70, y: 50 }) ?? '';
  assert.match(zone, /^à 32 m, dans l’axe$/);
});

test('un tir des six mètres se dit comme tel', () => {
  assert.match(zoneDuTir({ x: 97, y: 50 }) ?? '', /^des six mètres/);
});

test('on ne dit jamais la gauche ni la droite', () => {
  // Le camp d'où l'on regarde décide de la gauche : l'écrire serait faux une
  // fois sur deux pour un spectateur qui n'a pas les images.
  for (const y of [5, 25, 50, 75, 95]) {
    const zone = zoneDuTir({ x: 80, y }) ?? '';
    assert.doesNotMatch(zone, /gauche|droite/);
  }
});

// ── Le vocabulaire ───────────────────────────────────────────────────────────

test('chaque type de fait a un poids et un libellé', () => {
  // Le `Record<FaitKind, …>` l'impose au compilateur ; ce test le prouve à
  // l'exécution, parce qu'un `as` mal placé suffirait à percer le typage.
  const kinds = Object.keys(POIDS) as FaitKind[];
  assert.ok(kinds.length >= 14);
  for (const kind of kinds) {
    assert.equal(typeof POIDS[kind], 'number');
    assert.ok(LIBELLE[kind] && LIBELLE[kind].length > 0, `libellé manquant : ${kind}`);
    assert.equal(POIDS_POUSSEE[kind], POIDS[kind]);
    assert.equal(LIBELLE_POUSSEE[kind], LIBELLE[kind]);
  }
});

test('un carton ne crée pas de danger', () => {
  for (const kind of ['yellow', 'second_yellow', 'red', 'sub'] as FaitKind[]) {
    assert.equal(POIDS[kind], 0, `${kind} ne devrait pas peser`);
  }
});

test('les familles se tiennent', () => {
  assert.ok(estBut('penalty_goal'));
  assert.ok(estBut('own_goal'));
  assert.ok(!estBut('shot_on'));
  assert.ok(estTir('goal'));
  assert.ok(estTir('shot_blocked'));
  assert.ok(!estTir('corner'));
});

test('un remplacement se lit dans le sens de l’entrée', () => {
  const fait: FaitEntry = {
    seq: 1,
    t: T0,
    minute: '63',
    side: 'home',
    kind: 'sub',
    player: { id: 'a', name: 'Sortant', short: 'Sortant', number: 9 },
    second: { id: 'b', name: 'Entrant', short: 'Entrant', number: 20 },
  };
  assert.equal(detailDuFait(fait), 'Entrant remplace Sortant');
});

// ── Le fil ───────────────────────────────────────────────────────────────────

test('un corner existe enfin autrement que comme un compteur', () => {
  const events = [...depart(), ev(60_000, 'corner', { side: 'home' })];
  const state = reduce(events, T0 + 120_000);
  assert.deepEqual(state.stats.corners, [1, 0]);
  assert.equal(state.feed.length, 1);
  assert.equal(state.feed[0]!.kind, 'corner');
  // Une minute de jeu écoulée, c'est la 2e minute à l'antenne.
  assert.equal(state.feed[0]!.minute, '2');
});

test('un but ne produit qu’une ligne, même avec la frappe qui l’accompagne', () => {
  // ESPN annonce le but dans les faits marquants ET la frappe dans le fil du
  // commentaire : deux sources pour un seul ballon. Deux lignes à l'antenne
  // feraient croire à deux occasions.
  const tireur = { id: '7', name: 'Buteur', short: 'Buteur', number: 7 };
  const events = [
    ...depart(),
    ev(60_000, 'goal', { side: 'home', scorer: tireur, score: [1, 0] as Pair }),
    ev(60_000, 'shot', {
      side: 'home',
      onTarget: true,
      outcome: 'goal',
      x: 90,
      y: 50,
      player: tireur,
    }),
  ];
  const state = reduce(events, T0 + 120_000);
  assert.equal(state.feed.length, 1);
  const fait = state.feed[0]!;
  assert.equal(fait.kind, 'goal');
  // …et la ligne a hérité de la position que seule la frappe portait.
  assert.equal(fait.x, 90);
  assert.equal(detailDuFait(fait), 'Buteur, dans la surface, dans l’axe');
  // La frappe reste comptée dans les statistiques et sur la carte.
  assert.deepEqual(state.stats.shots, [1, 0]);
  assert.equal(state.shots.length, 1);
});

test('deux buts dans la même minute ne se volent pas leur position', () => {
  const events = [
    ...depart(),
    ev(60_000, 'goal', { side: 'home', score: [1, 0] as Pair }),
    ev(60_100, 'shot', { side: 'home', onTarget: true, outcome: 'goal', x: 90, y: 50 }),
    ev(70_000, 'goal', { side: 'home', score: [2, 0] as Pair }),
    ev(70_100, 'shot', { side: 'home', onTarget: true, outcome: 'goal', x: 60, y: 30 }),
  ];
  const state = reduce(events, T0 + 120_000);
  const buts = state.feed.filter((f) => estBut(f.kind));
  assert.equal(buts.length, 2);
  assert.equal(buts[0]!.x, 90);
  assert.equal(buts[1]!.x, 60);
});

test('une frappe sans but garde sa propre ligne', () => {
  const events = [
    ...depart(),
    ev(60_000, 'shot', { side: 'away', onTarget: false, outcome: 'blocked', x: 75, y: 40 }),
  ];
  const state = reduce(events, T0 + 120_000);
  assert.equal(state.feed.length, 1);
  assert.equal(state.feed[0]!.kind, 'shot_blocked');
});

test('un but contre son camp et un penalty se distinguent au fil', () => {
  const events = [
    ...depart(),
    ev(60_000, 'goal', { side: 'home', ownGoal: true, score: [0, 1] as Pair }),
    ev(120_000, 'goal', { side: 'away', penalty: true, score: [0, 2] as Pair }),
  ];
  const state = reduce(events, T0 + 180_000);
  assert.equal(state.feed[0]!.kind, 'own_goal');
  assert.equal(state.feed[1]!.kind, 'penalty_goal');
});

// ── Le fil et la courbe, d'accord par construction ───────────────────────────

test('tout ce qui pousse la courbe a sa ligne au fil', () => {
  const events = [
    ...depart(),
    ev(10_000, 'corner', { side: 'home' }),
    ev(20_000, 'shot', { side: 'home', onTarget: true, outcome: 'on_target' }),
    ev(30_000, 'offside', { side: 'away' }),
    ev(40_000, 'card', { side: 'away', card: 'yellow' }),
    ev(50_000, 'free_kick', { side: 'home' }),
    ev(60_000, 'penalty_awarded', { side: 'home' }),
    ev(70_000, 'goal', { side: 'home', penalty: true, score: [1, 0] as Pair }),
    ev(80_000, 'substitution', { side: 'away' }),
  ];
  const state = reduce(events, T0 + 120_000);

  // Chaque échantillon de pression doit pouvoir être justifié par un fait du
  // fil au même instant, du même camp.
  for (const sample of state.pressureLog) {
    const fait = state.feed.find((f) => f.t === sample.t && f.side === sample.side);
    assert.ok(fait, `pression à ${sample.t} sans fait au fil`);
    assert.equal(sample.kind, fait.kind);
    assert.equal(sample.weight, POIDS_POUSSEE[fait.kind]);
  }

  // Et réciproquement : un fait qui pèse a son échantillon.
  const pesants = state.feed.filter((f) => POIDS[f.kind] > 0);
  assert.equal(state.pressureLog.length, pesants.length);
  // Le carton et le remplacement sont au fil sans toucher à la courbe.
  assert.equal(state.feed.length, pesants.length + 2);
});

test('un temps fort pousse la courbe sans encombrer le fil', () => {
  // Il n'a ni auteur ni instant précis : en lister trente rendrait le fil
  // illisible, alors qu'il pèse réellement sur la pression.
  const events = [
    ...depart(),
    ev(10_000, 'attack', { side: 'home', intensity: 'dangerous' }),
    ev(20_000, 'attack', { side: 'home', intensity: 'attack' }),
  ];
  const state = reduce(events, T0 + 60_000);
  assert.equal(state.feed.length, 0);
  assert.equal(state.pressureLog.length, 2);
  assert.equal(state.pressureLog[0]!.kind, 'attaque_dangereuse');
  assert.equal(state.pressureLog[0]!.weight, 2);
  assert.equal(state.pressureLog[1]!.kind, 'attaque');
  assert.equal(state.pressureLog[1]!.weight, 1);
});

test('le fil est chronologique et rejouable à l’identique', () => {
  const events = [
    ...depart(),
    ev(10_000, 'corner', { side: 'home' }),
    ev(30_000, 'shot', { side: 'away', onTarget: true }),
    ev(20_000, 'offside', { side: 'home' }),
  ];
  // `reduce` exige des événements triés : c'est le contrat, on le respecte.
  events.sort((a, b) => a.t - b.t);
  const premier = reduce(events, T0 + 60_000);
  const second = reduce(events, T0 + 60_000);
  assert.deepEqual(premier.feed, second.feed);
  assert.deepEqual(
    premier.feed.map((f) => f.t),
    [T0 + 10_000, T0 + 20_000, T0 + 30_000],
  );
});

test('le fil ne connaît que le passé de l’instant demandé', () => {
  const events = [
    ...depart(),
    ev(10_000, 'corner', { side: 'home' }),
    ev(600_000, 'corner', { side: 'away' }),
  ];
  const state = reduce(events, T0 + 60_000);
  assert.equal(state.feed.length, 1);
  assert.equal(state.feed[0]!.side, 'home');
});
