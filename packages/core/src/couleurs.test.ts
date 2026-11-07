/**
 * La paire de couleurs d'un match.
 *
 * Les cas sont tirés de vrais clubs : c'est la seule façon de régler un seuil
 * perceptuel sans le choisir au hasard.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CLARTE_MINIMALE,
  ecart,
  lisible,
  PAIRE_DE_SECOURS,
  paireCouleurs,
  SEUIL_ECART,
} from './couleurs.js';

/** La clarté perçue d'un `#rrggbb`, pour vérifier qu'on voit bien la couleur. */
function clarte(hex: string): number {
  const n = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16) / 255);
  return (Math.max(...v) + Math.min(...v)) / 2;
}

const VITORIA = { color: '#C6101C', colorAlt: '#C60000' };
const FLUMINENSE = { color: '#7E0202', colorAlt: '#417505' };
const LYON = { color: '#1B3C8C', colorAlt: '#FFFFFF' };
const MARSEILLE = { color: '#FFFFFF', colorAlt: '#2FAEE0' };

test('deux rouges sombres ne passent pas', () => {
  // Le cas qui a motivé tout ce fichier : sur la carte des tirs, les deux
  // équipes devenaient la même tache.
  assert.ok(ecart(VITORIA.color, FLUMINENSE.color) < SEUIL_ECART);
});

test('le maillot extérieur sauve la mise', () => {
  const p = paireCouleurs(VITORIA, FLUMINENSE);
  assert.equal(p.substitue, 'away', 'on bascule sur le vert de Fluminense');
  assert.ok(ecart(p.home, p.away) >= SEUIL_ECART);
  // Rouge d'un côté, vert de l'autre : la teinte d'origine est préservée.
  assert.ok(clarte(p.home) >= CLARTE_MINIMALE - 0.01);
  assert.ok(clarte(p.away) >= CLARTE_MINIMALE - 0.01);
});

test('bleu contre blanc garde ses deux teintes', () => {
  const p = paireCouleurs(LYON, MARSEILLE);
  assert.equal(p.substitue, 'none');
  // Le blanc ne bouge pas : il est déjà clair.
  assert.equal(p.away.toUpperCase(), '#FFFFFF');
  // Le marine de Lyon est remonté, mais reste bleu — et donc reconnaissable.
  assert.ok(clarte(p.home) >= CLARTE_MINIMALE - 0.01);
  assert.ok(ecart(p.home, '#1B3C8C') < 0.3, 'toujours le même bleu');
});

test('une couleur sombre est remontée, pas remplacée', () => {
  // Le #7E0202 de Fluminense était strictement indiscernable du panneau.
  const clair = lisible('#7E0202')!;
  assert.ok(clarte(clair) >= CLARTE_MINIMALE - 0.01);
  const n = clair.replace('#', '');
  const r = Number.parseInt(n.slice(0, 2), 16);
  const v = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  assert.ok(r > v && r > b, 'toujours rouge');
});

test('une couleur déjà claire n’est pas touchée', () => {
  assert.equal(lisible('#FFFFFF')!.toUpperCase(), '#FFFFFF');
});

test('un noir devient une couleur, pas un gris de fond', () => {
  const clair = lisible('#000000')!;
  assert.ok(clarte(clair) >= CLARTE_MINIMALE - 0.01);
});

test('sans seconde couleur lisible, on abandonne les DEUX', () => {
  // Garder l'une des deux vraies ferait croire que l'autre l'est aussi.
  const a = { color: '#B00020' };
  const b = { color: '#A40018', colorAlt: '#AB0020' };
  const p = paireCouleurs(a, b);
  assert.equal(p.substitue, 'both');
  assert.deepEqual([p.home, p.away], [...PAIRE_DE_SECOURS]);
});

test('la paire de secours est elle-même lisible', () => {
  assert.ok(ecart(PAIRE_DE_SECOURS[0], PAIRE_DE_SECOURS[1]) >= SEUIL_ECART);
});

test('une équipe absente ne fait rien exploser', () => {
  const p = paireCouleurs(undefined, undefined);
  assert.deepEqual([p.home, p.away], [...PAIRE_DE_SECOURS]);
});

test('une couleur illisible est traitée comme différente, pas comme une erreur', () => {
  // Un fournisseur qui enverrait « red » ou une chaîne vide ne doit pas faire
  // basculer tout le plateau sur la paire de secours sans raison.
  assert.equal(ecart('pas-une-couleur', '#000000'), 1);
  const p = paireCouleurs({ color: 'red' }, { color: '#000000' });
  assert.equal(p.substitue, 'none');
});

test('le format court à trois chiffres est compris', () => {
  assert.ok(ecart('#fff', '#ffffff') < 0.001);
  assert.ok(ecart('000', '#000000') < 0.001);
});

test('la fonction est pure : deux appels, même résultat', () => {
  // Les deux sources navigateur d'OBS doivent arriver à la même paire.
  assert.deepEqual(paireCouleurs(VITORIA, FLUMINENSE), paireCouleurs(VITORIA, FLUMINENSE));
});
