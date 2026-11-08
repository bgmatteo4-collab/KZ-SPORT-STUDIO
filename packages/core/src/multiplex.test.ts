/**
 * L'ordre du multiplex.
 *
 * Depuis qu'il voit tout le football du jour, c'est le tri qui décide de ce
 * qu'on montre — et donc de ce qu'on rate. Chaque test ici correspond à une
 * façon de rater quelque chose d'important.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FLASH_MS,
  grouperMultiplex,
  interetDe,
  INTERET_INCONNU,
  nomCourtCompetition,
  trierMultiplex,
  vientDeMarquer,
} from './multiplex.js';
import { reduce } from './reduce.js';
import type { MatchEvent, OtherMatch, Pair, TeamBrief } from './types.js';

const T0 = 1_700_000_000_000;

const eq = (short: string): TeamBrief => ({ short, abbr: short.slice(0, 3), color: '#888' });

function match(p: Partial<OtherMatch> & { id: string }): OtherMatch {
  return {
    minute: '30',
    live: true,
    home: eq(`${p.id}-dom`),
    away: eq(`${p.id}-ext`),
    score: [0, 0] as Pair,
    ...p,
  };
}

// ── Le tri ───────────────────────────────────────────────────────────────────

test('ce qui vient de marquer passe devant tout', () => {
  const liste = [
    match({ id: 'a', competitionId: 'uefa.champions' }),
    match({ id: 'b', competitionId: 'ita.2', scoreChangedAt: T0 - 3_000 }),
  ];
  const trie = trierMultiplex(liste, T0);
  assert.equal(trie[0]!.id, 'b', 'un but en Serie B passe devant la Ligue des Champions');
});

test('un but d’il y a cinq minutes ne passe plus devant', () => {
  const liste = [
    match({ id: 'a', competitionId: 'uefa.champions' }),
    match({ id: 'b', competitionId: 'ita.2', scoreChangedAt: T0 - 5 * 60_000 }),
  ];
  assert.equal(trierMultiplex(liste, T0)[0]!.id, 'a');
});

test('ce qui joue passe devant ce qui est fini', () => {
  const liste = [
    match({ id: 'fini', competitionId: 'uefa.champions', live: false }),
    match({ id: 'joue', competitionId: 'ita.2', live: true }),
  ];
  assert.equal(trierMultiplex(liste, T0)[0]!.id, 'joue');
});

test('la compétition du match commenté passe devant le reste du monde', () => {
  // Ce sont ses rencontres qui font bouger le classement qu'on vient
  // d'afficher : les reléguer derrière la Premier League serait un contresens.
  const liste = [
    match({ id: 'pl', competitionId: 'eng.1' }),
    match({ id: 'bra', competitionId: 'bra.1' }),
  ];
  assert.equal(trierMultiplex(liste, T0, 'bra.1')[0]!.id, 'bra');
  assert.equal(trierMultiplex(liste, T0)[0]!.id, 'pl', 'sans priorité, l’intérêt reprend la main');
});

test('une compétition inconnue est listée, pas cachée', () => {
  assert.equal(interetDe('une.ligue.inconnue'), INTERET_INCONNU);
  assert.equal(interetDe(undefined), INTERET_INCONNU);
  const liste = [match({ id: 'x' }), match({ id: 'y', competitionId: 'fra.1' })];
  assert.equal(trierMultiplex(liste, T0).length, 2);
});

test('l’ordre est STABLE à données égales', () => {
  // Deux matchs qui permuteraient d'un rafraîchissement à l'autre feraient
  // clignoter le panneau sans qu'il se passe rien.
  const liste = [
    match({ id: 'zzz', competitionId: 'fra.1' }),
    match({ id: 'aaa', competitionId: 'fra.1' }),
  ];
  const un = trierMultiplex(liste, T0).map((m) => m.id);
  const deux = trierMultiplex([...liste].reverse(), T0).map((m) => m.id);
  assert.deepEqual(un, deux);
  assert.deepEqual(un, ['aaa', 'zzz']);
});

test('le signalement s’éteint tout seul', () => {
  const m = match({ id: 'a', scoreChangedAt: T0 });
  assert.ok(vientDeMarquer(m, T0 + 1_000));
  assert.ok(!vientDeMarquer(m, T0 + FLASH_MS + 1));
  // Et un but « dans le futur » — ce qui arrive en rejeu — ne s'allume pas.
  assert.ok(!vientDeMarquer(m, T0 - 1_000));
});

// ── Le groupement ────────────────────────────────────────────────────────────

test('les groupes suivent le même ordre que les lignes', () => {
  const liste = [
    match({ id: 'a', competitionId: 'ita.2', competition: 'Serie B' }),
    match({ id: 'b', competitionId: 'fra.1', competition: 'Ligue 1' }),
    match({ id: 'c', competitionId: 'fra.1', competition: 'Ligue 1' }),
  ];
  const groupes = grouperMultiplex(liste, T0);
  assert.deepEqual(
    groupes.map((g) => g.competition),
    ['Ligue 1', 'Serie B'],
  );
  assert.equal(groupes[0]!.matches.length, 2);
});

test('un but fait remonter son groupe entier', () => {
  const liste = [
    match({ id: 'a', competitionId: 'fra.1', competition: 'Ligue 1' }),
    match({ id: 'b', competitionId: 'ita.2', competition: 'Serie B', scoreChangedAt: T0 - 2_000 }),
  ];
  assert.equal(grouperMultiplex(liste, T0)[0]!.competition, 'Serie B');
});

test('un match sans compétition atterrit dans un groupe nommé', () => {
  const groupes = grouperMultiplex([match({ id: 'a' })], T0);
  assert.equal(groupes[0]!.competition, 'Autres rencontres');
  assert.equal(groupes[0]!.competitionId, undefined);
});

// ── La détection du but, côté réducteur ──────────────────────────────────────

let seq = 0;
function ev(tOffset: number, matches: OtherMatch[]): MatchEvent {
  return { seq: seq++, t: T0 + tOffset, kind: 'other_matches', payload: { matches } };
}

test('le réducteur date le changement de score', () => {
  seq = 0;
  const events = [
    ev(0, [match({ id: 'a', score: [0, 0] })]),
    ev(60_000, [match({ id: 'a', score: [1, 0] })]),
  ];
  const state = reduce(events, T0 + 70_000);
  assert.equal(state.otherMatches[0]!.scoreChangedAt, T0 + 60_000);
  assert.ok(vientDeMarquer(state.otherMatches[0]!, T0 + 70_000));
});

test('un match vu pour la première fois n’a pas marqué', () => {
  // Au démarrage, tout le tableau s'allumerait d'un coup.
  seq = 0;
  const state = reduce([ev(0, [match({ id: 'a', score: [2, 1] })])], T0 + 1_000);
  assert.equal(state.otherMatches[0]!.scoreChangedAt, undefined);
  assert.ok(!vientDeMarquer(state.otherMatches[0]!, T0 + 1_000));
});

test('un score inchangé garde sa date, il ne la rafraîchit pas', () => {
  // Sinon la ligne resterait allumée en permanence : le fournisseur réémet
  // l'instantané complet toutes les quarante-cinq secondes.
  seq = 0;
  const events = [
    ev(0, [match({ id: 'a', score: [0, 0] })]),
    ev(10_000, [match({ id: 'a', score: [1, 0] })]),
    ev(20_000, [match({ id: 'a', score: [1, 0] })]),
    ev(30_000, [match({ id: 'a', score: [1, 0] })]),
  ];
  const state = reduce(events, T0 + 40_000);
  assert.equal(state.otherMatches[0]!.scoreChangedAt, T0 + 10_000);
});

test('le repli est déterministe : deux calculs, même résultat', () => {
  seq = 0;
  const events = [
    ev(0, [match({ id: 'a', score: [0, 0] }), match({ id: 'b', score: [0, 0] })]),
    ev(30_000, [match({ id: 'a', score: [1, 0] }), match({ id: 'b', score: [0, 0] })]),
  ];
  assert.deepEqual(reduce(events, T0 + 40_000).otherMatches, reduce(events, T0 + 40_000).otherMatches);
});

test('un nom de compétition trop long devient un sigle', () => {
  // Le cas vu à l'antenne : « Russian Premier League » tranché en plein mot
  // dans la marge du multiplex. Trois mots ou plus → sigle.
  assert.equal(nomCourtCompetition('rus.1', 'Russian Premier League'), 'RPL');
  assert.equal(nomCourtCompetition(undefined, 'Primeira Liga de Portugal'), 'PLP');
});

test('un nom court est laissé tel quel', () => {
  assert.equal(nomCourtCompetition('tur.1', 'Süper Lig'), 'Süper Lig');
  assert.equal(nomCourtCompetition(undefined, 'Liga F'), 'Liga F');
  // Deux mots longs restent lisibles en toutes lettres : un sigle de deux
  // lettres n'apprendrait rien de plus.
  assert.equal(nomCourtCompetition(undefined, 'Eredivisie'), 'Eredivisie');
});

test('la table passe avant le repli', () => {
  assert.equal(nomCourtCompetition('uefa.champions', 'UEFA Champions League'), 'LDC');
});
