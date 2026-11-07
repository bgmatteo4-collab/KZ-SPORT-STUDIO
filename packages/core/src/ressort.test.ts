/**
 * Le ressort.
 *
 * Il porte tout le mouvement du projet — l'antenne comme la régie. Un ressort
 * qui n'arrive jamais au repos consomme une image sur deux en permanence dans
 * OBS ; un ressort instable fait vibrer un carton de but à l'antenne. Les deux
 * défauts sont invisibles en relisant le code et évidents à l'écran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MOUVEMENTS, Ressort } from './ressort.js';

/** Fait tourner un ressort comme le ferait une boucle d'images à 60 Hz. */
function jouer(r: Ressort, secondes: number, pasMs = 16.7): number[] {
  const out: number[] = [];
  for (let t = 0; t < secondes * 1000; t += pasMs) out.push(r.avance(pasMs));
  return out;
}

test('un ressort arrive, et il s’arrête', () => {
  // Sans ça, la boucle de rendu ne se coupe jamais : une régie ouverte toute
  // une soirée consommerait une image sur deux à animer l'immobilité.
  const r = new Ressort(0, MOUVEMENTS.vif);
  r.viser(1);
  jouer(r, 2);
  assert.ok(r.repos, 'le ressort doit se déclarer au repos');
  assert.equal(r.valeur, 1, 'et se poser exactement sur la cible');
});

test('il arrive à peu près dans le temps annoncé', () => {
  // `reponse` est une durée approximative : à 0,26 s, on doit être arrivé bien
  // avant une seconde, et pas encore au départ à 50 ms.
  const r = new Ressort(0, MOUVEMENTS.vif);
  r.viser(1);
  r.avance(50);
  assert.ok(r.valeur > 0.05 && r.valeur < 0.95, `à 50 ms : ${r.valeur}`);
  jouer(r, 1);
  assert.ok(r.repos);
});

test('un amortissement sous 1 dépasse, un amortissement à 1 ne dépasse pas', () => {
  const souple = new Ressort(0, { reponse: 0.4, amorti: 0.6 });
  souple.viser(1);
  const avec = jouer(souple, 2, 4);
  assert.ok(Math.max(...avec) > 1.02, 'un ressort souple doit dépasser sa cible');

  const ferme = new Ressort(0, { reponse: 0.4, amorti: 1 });
  ferme.viser(1);
  const sans = jouer(ferme, 2, 4);
  assert.ok(Math.max(...sans) <= 1.0005, `aucun dépassement attendu, vu ${Math.max(...sans)}`);
});

test('changer de cible en plein vol conserve la vitesse', () => {
  // C'est toute la raison d'être d'un ressort : une courbe de durée fixe
  // repartirait de zéro et on verrait la saccade.
  const r = new Ressort(0, MOUVEMENTS.surface);
  r.viser(1);
  r.avance(100);
  const aMiChemin = r.valeur;
  r.viser(0);
  r.avance(16);
  // La vitesse était positive : le ressort continue encore un peu vers le
  // haut avant de rebrousser chemin. Il ne SAUTE pas en arrière.
  assert.ok(r.valeur > aMiChemin - 0.05, `saut détecté : ${aMiChemin} → ${r.valeur}`);
  jouer(r, 2);
  assert.equal(r.valeur, 0);
});

test('un ressort raide reste stable à 60 images par seconde', () => {
  // Intégré en un seul pas de 16 ms, un ressort court diverge : il oscille au
  // lieu de se poser. Les sous-pas de 4 ms sont là pour ça.
  const r = new Ressort(0, { reponse: 0.12, amorti: 0.7 });
  r.viser(1);
  const valeurs = jouer(r, 3);
  assert.ok(Math.max(...valeurs) < 2, `divergence : max ${Math.max(...valeurs)}`);
  assert.ok(r.repos, 'il doit finir par se poser');
});

test('un onglet rendormi ne rattrape pas une minute de physique', () => {
  const r = new Ressort(0, MOUVEMENTS.doux);
  r.viser(1);
  // Le navigateur rend la main après une minute : `dt` vaut 60 000 ms.
  r.avance(60_000);
  // La borne limite le saut à 100 ms de physique : on a avancé, pas téléporté.
  assert.ok(r.valeur > 0 && r.valeur < 0.9, `saut non borné : ${r.valeur}`);
});

test('poser ne laisse aucune vitesse résiduelle', () => {
  // C'est ce qu'emploie le mode « mouvement réduit » : la valeur doit être
  // atteinte, et rien ne doit bouger ensuite.
  const r = new Ressort(0, MOUVEMENTS.vif);
  r.viser(1);
  r.avance(80);
  r.poser(0.5);
  assert.equal(r.valeur, 0.5);
  assert.ok(r.repos);
  r.avance(16);
  assert.equal(r.valeur, 0.5);
});

test('les trois mouvements du projet sont réglés, pas improvisés', () => {
  for (const [nom, m] of Object.entries(MOUVEMENTS)) {
    assert.ok(m.reponse > 0 && m.reponse < 1, `${nom} : réponse hors de l’échelle humaine`);
    assert.ok(m.amorti > 0 && m.amorti <= 1, `${nom} : amortissement invalide`);
  }
});
