/**
 * La projection du classement.
 *
 * Un classement est lu comme un FAIT à l'antenne. Celui-ci est une hypothèse,
 * et se tromper dessus revient à annoncer un titre ou une relégation qui
 * n'existent pas. D'où ces tests, qui tiennent surtout aux bords : le match
 * déjà compté, les équipes absentes, l'égalité de points.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classementProjete, tranche } from './classement.js';
import type { StandingRow, TeamBrief } from './types.js';

const eq = (id: string, short: string): TeamBrief => ({ id, short, abbr: short.slice(0, 3), color: '#000' });

const DOM = eq('1', 'Vitória');
const EXT = eq('2', 'Fluminense');

function table(): StandingRow[] {
  return [
    { rank: 1, team: eq('9', 'Flamengo'), played: 34, diff: 40, points: 76, zone: 'win' },
    { rank: 2, team: EXT, played: 33, diff: 10, points: 54, zone: 'win' },
    { rank: 3, team: eq('8', 'Bahia'), played: 34, diff: 8, points: 54, zone: null },
    { rank: 4, team: DOM, played: 33, diff: -13, points: 38, zone: null },
    { rank: 5, team: eq('7', 'Ceará'), played: 34, diff: -14, points: 37, zone: 'lose' },
  ];
}

test('une victoire ajoute trois points et remonte l’équipe', () => {
  const p = classementProjete(table(), DOM, EXT, [0, 2], 'second_half');
  assert.equal(p.projete, true);
  const flu = p.rows.find((r) => r.team.id === '2')!;
  assert.equal(flu.points, 57);
  assert.equal(flu.played, 34);
  assert.equal(flu.diff, 12);
  // 57 points la place désormais devant Bahia et ses 54 : elle était 2e, elle
  // le reste, mais Bahia ne peut plus la rattraper à la différence de buts.
  assert.equal(flu.rank, 2);

  const vit = p.rows.find((r) => r.team.id === '1')!;
  assert.equal(vit.points, 38);
  assert.equal(vit.diff, -15);
});

test('un nul donne un point à chacun', () => {
  const p = classementProjete(table(), DOM, EXT, [1, 1], 'full_time');
  const flu = p.rows.find((r) => r.team.id === '2')!;
  const vit = p.rows.find((r) => r.team.id === '1')!;
  assert.equal(flu.points, 55);
  assert.equal(vit.points, 39);
  assert.equal(flu.diff, 10);
  assert.equal(vit.diff, -13);
});

test('le mouvement est mesuré contre le rang publié', () => {
  // Vitória, 4e avec 38 points, gagne : 41 points la passent devant Bahia (54)
  // ? Non — mais devant personne ici. On prend donc un cas franc : une large
  // victoire de Vitória lui fait dépasser Ceará, qu'elle devançait déjà.
  const avant = table();
  // Ceará à 40 points, devant Vitória.
  avant[4] = { ...avant[4]!, points: 40, rank: 4 };
  avant[3] = { ...avant[3]!, rank: 5 };
  const p = classementProjete(avant, DOM, EXT, [3, 0], 'full_time');
  const vit = p.rows.find((r) => r.team.id === '1')!;
  assert.equal(vit.points, 41);
  assert.equal(vit.bouge, 1, 'Vitória passe devant Ceará');
  const ceara = p.rows.find((r) => r.team.id === '7')!;
  assert.equal(ceara.bouge, -1);
});

test('un match déjà compté par la source n’est pas compté deux fois', () => {
  // C'est le piège : projeter sur un tableau à jour donnerait six points pour
  // une victoire, et un classement faux au moment où on l'ouvre.
  const aJour = table().map((r) => ({ ...r, played: 34 }));
  const p = classementProjete(aJour, DOM, EXT, [0, 2], 'full_time');
  assert.equal(p.projete, false);
  assert.equal(p.raison, 'deja-compte');
  assert.deepEqual(
    p.rows.map((r) => r.points),
    aJour.map((r) => r.points),
  );
});

test('avant le coup d’envoi, on ne projette rien', () => {
  const p = classementProjete(table(), DOM, EXT, [0, 0], 'pre');
  assert.equal(p.projete, false);
  assert.equal(p.raison, 'pas-commence');
});

test('une coupe, dont les équipes ne sont pas au tableau, ne casse rien', () => {
  const p = classementProjete(table(), eq('77', 'Ajax'), eq('78', 'PSV'), [1, 0], 'second_half');
  assert.equal(p.projete, false);
  assert.equal(p.raison, 'equipes-absentes');
  assert.equal(p.rows.length, 5);
  assert.ok(p.rows.every((r) => !r.enJeu));
});

test('les deux équipes du match sont marquées', () => {
  const p = classementProjete(table(), DOM, EXT, [0, 2], 'second_half');
  assert.deepEqual(
    p.rows.filter((r) => r.enJeu).map((r) => r.team.short).sort(),
    ['Fluminense', 'Vitória'],
  );
});

test('sans identifiant, on retombe sur le nom d’antenne', () => {
  const sansId = table().map((r) => ({ ...r, team: { ...r.team, id: undefined } }));
  const p = classementProjete(sansId, { short: 'Vitória', abbr: 'VIT', color: '#000' }, { short: 'Fluminense', abbr: 'FLU', color: '#000' }, [0, 1], 'full_time');
  assert.equal(p.projete, true);
});

// ── La fenêtre ───────────────────────────────────────────────────────────────

test('tout rentre : on ne coupe rien', () => {
  const rows = table().map((r) => ({ ...r, enJeu: false }));
  assert.equal(tranche(rows, 10).length, 5);
});

test('la fenêtre glisse pour inclure l’équipe la plus mal classée', () => {
  // Le cas réel qui a motivé la réécriture : Fluminense 4e, Vitória 15e, et un
  // cadre de huit lignes. Couper par le haut faisait disparaître le match.
  const rows = Array.from({ length: 20 }, (_, i) => ({
    rank: i + 1,
    enJeu: i === 3 || i === 14,
  }));
  const vue = tranche(rows, 8);
  assert.equal(vue.length, 8);
  assert.ok(vue.some((r) => r.rank === 15), 'la 15e doit être visible');
  assert.ok(vue.some((r) => r.rank === 1), 'le haut du tableau reste visible');
});

test('sans équipe marquée, on garde le haut du tableau', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, enJeu: false }));
  const vue = tranche(rows, 6);
  assert.deepEqual(
    vue.map((r) => r.rank),
    [1, 2, 3, 4, 5, 6],
  );
});

test('une équipe déjà dans la fenêtre ne la fait pas glisser', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ rank: i + 1, enJeu: i === 1 || i === 4 }));
  const vue = tranche(rows, 8);
  assert.deepEqual(
    vue.map((r) => r.rank),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});
