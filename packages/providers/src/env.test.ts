/**
 * Les invariants du chargeur de `.env`.
 *
 * Ces quinze lignes méritent des tests parce qu'elles ont déjà échoué une fois
 * — en silence. Le lanceur écrivait `KZ_PROVIDER=espn` dans un fichier que
 * personne n'ouvrait ; le serveur démarrait sur le simulateur sans la moindre
 * erreur, et on cherchait ailleurs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chargerEnv } from './env.js';

function fichier(contenu: string): string {
  const dossier = mkdtempSync(join(tmpdir(), 'kz-env-'));
  const chemin = join(dossier, '.env');
  writeFileSync(chemin, contenu);
  return chemin;
}

/** Repart d'un environnement propre pour les noms qu'on manipule. */
function nettoyer(...noms: string[]): void {
  for (const n of noms) delete process.env[n];
}

test('les paires sont posées dans l’environnement', () => {
  nettoyer('KZ_TEST_A', 'KZ_TEST_B');
  const poses = chargerEnv(fichier('KZ_TEST_A=espn\nKZ_TEST_B=fra.1\n'));
  assert.deepEqual(poses.sort(), ['KZ_TEST_A', 'KZ_TEST_B']);
  assert.equal(process.env.KZ_TEST_A, 'espn');
  assert.equal(process.env.KZ_TEST_B, 'fra.1');
  nettoyer('KZ_TEST_A', 'KZ_TEST_B');
});

test('une variable DÉJÀ posée gagne toujours sur le fichier', () => {
  // Sinon on ne peut plus rien forcer le temps d'un essai :
  // `KZ_PROVIDER=simulator pnpm dev` doit l'emporter.
  nettoyer('KZ_TEST_C');
  process.env.KZ_TEST_C = 'impose';
  const poses = chargerEnv(fichier('KZ_TEST_C=depuis-le-fichier\n'));
  assert.deepEqual(poses, [], 'rien ne devait être posé');
  assert.equal(process.env.KZ_TEST_C, 'impose');
  nettoyer('KZ_TEST_C');
});

test('commentaires, lignes vides et espaces sont ignorés', () => {
  nettoyer('KZ_TEST_D', 'KZ_TEST_E');
  chargerEnv(
    fichier('# un commentaire\n\n   \n  KZ_TEST_D = espn  \nKZ_TEST_E=""\n# KZ_TEST_F=jamais\n'),
  );
  assert.equal(process.env.KZ_TEST_D, 'espn');
  assert.equal(process.env.KZ_TEST_E, '');
  assert.equal(process.env.KZ_TEST_F, undefined);
  nettoyer('KZ_TEST_D', 'KZ_TEST_E');
});

test('les guillemets entourant la valeur sont retirés', () => {
  nettoyer('KZ_TEST_G', 'KZ_TEST_H');
  chargerEnv(fichier('KZ_TEST_G="une valeur"\nKZ_TEST_H=\'autre\'\n'));
  assert.equal(process.env.KZ_TEST_G, 'une valeur');
  assert.equal(process.env.KZ_TEST_H, 'autre');
  nettoyer('KZ_TEST_G', 'KZ_TEST_H');
});

test('un nom invalide est écarté plutôt qu’injecté', () => {
  nettoyer('KZ_TEST_I');
  const poses = chargerEnv(fichier('2MAUVAIS=x\nmauvais nom=y\n=rien\nKZ_TEST_I=bon\n'));
  assert.deepEqual(poses, ['KZ_TEST_I']);
  nettoyer('KZ_TEST_I');
});

test('un fichier absent ne fait rien exploser', () => {
  // C'est le cas NORMAL : en production, il n'y a pas forcément de `.env`.
  assert.doesNotThrow(() => chargerEnv('/tmp/kz-ce-fichier-nexiste-pas-du-tout'));
  assert.deepEqual(chargerEnv('/tmp/kz-ce-fichier-nexiste-pas-du-tout'), []);
});
