/**
 * Les invariants de la traduction Sportmonks.
 *
 * La charge utile ci-dessous est SYNTHÉTIQUE : construite d'après la
 * documentation, pas capturée sur un vrai match. Elle vérifie donc la logique
 * de traduction, pas la forme réelle des réponses — c'est l'enregistreur qui
 * tranchera ça, et ces tests seront alors rejoués contre la capture.
 *
 * Ce qu'ils couvrent déjà et qui compte : l'idempotence, le fait que le score
 * ne soit jamais recompté, et le comportement quand la documentation nous
 * laisse dans le flou.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lireScore, nouvelEtat, phaseDepuisEtat, traduire } from './translate.js';
import type { SmFixture } from './types.js';

const T = 1_700_000_000_000;

function match(): SmFixture {
  return {
    id: 19339023,
    name: 'Real Madrid vs Manchester City',
    starting_at: '2026-04-14 19:00:00',
    state: { id: 22, state: 'INPLAY_2ND_HALF' },
    league: { id: 2, name: 'UEFA Champions League' },
    round: { id: 7, name: 'Quarter-final' },
    venue: { id: 1, name: 'Santiago Bernabéu' },
    participants: [
      { id: 3468, name: 'Real Madrid', short_code: 'RMA', meta: { location: 'home' } },
      { id: 9, name: 'Manchester City', short_code: 'MCI', meta: { location: 'away' } },
    ],
    periods: [
      { id: 1, type_id: 1, ticking: false, minutes: 45, seconds: 0, sort_order: 1 },
      { id: 2, type_id: 2, ticking: true, minutes: 67, seconds: 23, time_added: 0, sort_order: 2 },
    ],
    scores: [
      { id: 1, participant_id: 3468, description: 'CURRENT', score: { goals: 2, participant: 'home' } },
      { id: 2, participant_id: 9, description: 'CURRENT', score: { goals: 1, participant: 'away' } },
    ],
    events: [
      {
        id: 101, type_id: 14, participant_id: 3468, minute: 23, sort_order: 1,
        player_id: 5, player_name: 'Kylian Mbappé',
        related_player_id: 7, related_player_name: 'Vinícius Júnior', result: '1-0',
      },
      { id: 102, type_id: 19, participant_id: 9, minute: 35, sort_order: 2, player_id: 16, player_name: 'Rodri Hernández' },
      { id: 103, type_id: 14, participant_id: 9, minute: 41, sort_order: 3, player_id: 9, player_name: 'Erling Haaland', result: '1-1' },
      {
        id: 104, type_id: 18, participant_id: 3468, minute: 61, sort_order: 4,
        player_id: 5, player_name: 'Jude Bellingham',
        related_player_id: 10, related_player_name: 'Luka Modrić',
      },
      { id: 105, type_id: 16, participant_id: 3468, minute: 58, sort_order: 5, player_id: 5, player_name: 'Kylian Mbappé', result: '2-1' },
    ],
    statistics: [
      { id: 1, type_id: 45, participant_id: 3468, location: 'home', data: { value: 56 } },
      { id: 2, type_id: 45, participant_id: 9, location: 'away', data: { value: 44 } },
      { id: 3, type_id: 42, participant_id: 3468, location: 'home', data: { value: 12 } },
      { id: 4, type_id: 42, participant_id: 9, location: 'away', data: { value: 8 } },
    ],
    lineups: [
      { id: 1, team_id: 3468, player_id: 1, player_name: 'Andriy Lunin', jersey_number: 1, formation_field: '1:1' },
      { id: 2, team_id: 3468, player_id: 2, player_name: 'Dani Carvajal', jersey_number: 2, formation_field: '2:1' },
      { id: 3, team_id: 3468, player_id: 3, player_name: 'Éder Militão', jersey_number: 3, formation_field: '2:2' },
      { id: 4, team_id: 3468, player_id: 8, player_name: 'Federico Valverde', jersey_number: 8, formation_field: '3:1' },
      { id: 5, team_id: 3468, player_id: 11, player_name: 'Rodrygo', jersey_number: 11, formation_field: '4:1' },
      { id: 6, team_id: 3468, player_id: 13, player_name: 'Thibaut Courtois', jersey_number: 13, formation_field: null },
    ],
    ballCoordinates: [{ id: 1, timer: '67:20', x: '62.5', y: '41.0' }],
  };
}

test('une seconde interrogation n’émet rien de nouveau', () => {
  // C'est l'invariant qui compte le plus : l'API renvoie l'état COMPLET à
  // chaque appel. Sans idempotence, le même but arriverait cinquante fois.
  const etat = nouvelEtat();
  const premier = traduire(match(), T, etat);
  assert.ok(premier.length > 0);

  const second = traduire(match(), T + 10_000, etat);
  assert.deepEqual(second, [], `rien ne devait être réémis, reçu : ${second.map((e) => e.kind).join(', ')}`);
});

test('le score vient de `scores`, jamais d’une addition de buts', () => {
  const etat = nouvelEtat();
  const evenements = traduire(match(), T, etat);
  const score = evenements.find((e) => e.kind === 'score');
  assert.ok(score);
  assert.deepEqual((score.payload as { score: [number, number] }).score, [2, 1]);

  // Trois événements de type but sont présents ; le score reste celui du
  // fournisseur, pas 3-1.
  const buts = evenements.filter((e) => e.kind === 'goal');
  assert.equal(buts.length, 3);
});

test('à défaut de `scores`, le champ `result` du dernier but prend le relais', () => {
  const sans = match();
  delete sans.scores;
  assert.deepEqual(lireScore(sans, 3468, 9), [2, 1]);
});

test('domicile et extérieur sont lus dans `meta.location`', () => {
  const etat = nouvelEtat();
  const evenements = traduire(match(), T, etat);
  const meta = evenements.find((e) => e.kind === 'meta');
  assert.ok(meta);
  const p = meta.payload as { home: { abbr: string }; away: { abbr: string } };
  assert.equal(p.home.abbr, 'RMA');
  assert.equal(p.away.abbr, 'MCI');
  assert.equal(etat.lacunes.size, 0, `lacunes inattendues : ${[...etat.lacunes].join(', ')}`);
});

test('sans localisation, on déduit de l’ordre — mais on le SIGNALE', () => {
  // Un plateau qui inverse les équipes est pire qu'un plateau vide : la
  // déduction est permise, le silence non.
  const flou = match();
  flou.participants = flou.participants!.map((p) => ({ id: p.id, name: p.name, short_code: p.short_code }));
  const etat = nouvelEtat();
  traduire(flou, T, etat);
  assert.equal(etat.domicile, 3468);
  assert.ok([...etat.lacunes].some((l) => l.includes('déduits')), 'la déduction doit être signalée');
});

test('les cartons, remplacements et penalties sont correctement typés', () => {
  const etat = nouvelEtat();
  const evenements = traduire(match(), T, etat);

  const carton = evenements.find((e) => e.kind === 'card');
  assert.equal((carton!.payload as { card: string }).card, 'yellow');

  const remplacement = evenements.find((e) => e.kind === 'substitution');
  const r = remplacement!.payload as { in?: { short: string }; out?: { short: string } };
  assert.equal(r.in?.short, 'Bellingham');
  assert.equal(r.out?.short, 'Modrić');

  const penalty = evenements.filter((e) => e.kind === 'goal').find((e) => (e.payload as { penalty?: boolean }).penalty);
  assert.ok(penalty, 'le but sur penalty doit être marqué comme tel');
});

test('l’horloge est ancrée sur la période qui tourne', () => {
  const etat = nouvelEtat();
  const horloge = traduire(match(), T, etat).find((e) => e.kind === 'clock');
  assert.ok(horloge);
  const p = horloge.payload as { matchMs: number; running: boolean; phase: string };
  assert.equal(p.matchMs, 67 * 60_000 + 23_000);
  assert.equal(p.running, true);
  assert.equal(p.phase, 'second_half');
});

test('les coordonnées du ballon sont ramenées dans [0,1]', () => {
  const etat = nouvelEtat();
  const balle = traduire(match(), T, etat).find((e) => e.kind === 'ball');
  assert.ok(balle);
  const p = balle.payload as { x: number; y: number };
  assert.ok(p.x > 0.6 && p.x < 0.63, `x hors bornes : ${p.x}`);
  assert.ok(p.y > 0.4 && p.y < 0.42, `y hors bornes : ${p.y}`);
});

test('la formation se déduit des lignes des titulaires', () => {
  const etat = nouvelEtat();
  const compo = traduire(match(), T, etat).find((e) => e.kind === 'lineup');
  assert.ok(compo);
  const p = compo.payload as { formation: string; starters: unknown[]; bench: unknown[] };
  // Deux défenseurs, un milieu, un attaquant dans cet échantillon réduit.
  assert.equal(p.formation, '2-1-1');
  assert.equal(p.starters.length, 5);
  assert.equal(p.bench.length, 1);
});

test('les libellés d’état se traduisent en périodes', () => {
  assert.equal(phaseDepuisEtat('NS'), 'pre');
  assert.equal(phaseDepuisEtat('INPLAY_1ST_HALF'), 'first_half');
  assert.equal(phaseDepuisEtat('HT'), 'half_time');
  assert.equal(phaseDepuisEtat('INPLAY_2ND_HALF'), 'second_half');
  assert.equal(phaseDepuisEtat('INPLAY_PENALTIES'), 'penalties');
  assert.equal(phaseDepuisEtat('FT'), 'full_time');
});

test('un nouveau fait arrivé au tour suivant est bien émis', () => {
  const etat = nouvelEtat();
  traduire(match(), T, etat);

  const plusTard = match();
  plusTard.events!.push({
    id: 106, type_id: 20, participant_id: 9, minute: 78, sort_order: 6,
    player_id: 2, player_name: 'Kyle Walker',
  });
  const nouveaux = traduire(plusTard, T + 10_000, etat);
  assert.equal(nouveaux.length, 1);
  assert.equal(nouveaux[0]!.kind, 'card');
  assert.equal((nouveaux[0]!.payload as { card: string }).card, 'red');
});

test('une réponse vide ne fait rien exploser', () => {
  // Règle n°6, côté données : pas de donnée, pas d'événement, jamais d'erreur.
  const etat = nouvelEtat();
  assert.doesNotThrow(() => traduire({}, T, etat));
  assert.doesNotThrow(() => traduire({ participants: [] }, T, etat));
});
