/**
 * Les invariants du compositeur de scènes.
 *
 * Ce qui est vérifié ici n'est pas de l'esthétique : c'est qu'une scène ne
 * puisse pas vider le plateau, ni envoyer une couche du mauvais côté de la
 * caméra. Les deux se voient à l'antenne et nulle part ailleurs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAM_Z,
  DEFAULT_SCENE_MODE,
  findScene,
  layersFor,
  SCENE_MODES,
  SCENES,
  type SceneMode,
} from './scenes.js';

test('chaque scène a un identifiant unique et au moins une couche', () => {
  const ids = SCENES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `identifiants en double : ${ids.join(', ')}`);
  for (const scene of SCENES) {
    assert.ok(scene.layers.length > 0, `la scène « ${scene.id} » est vide`);
  }
});

test('aucune couche ne vit EXACTEMENT sur le plan de la caméra', () => {
  // `layersFor` partage le monde en deux avec `<` et `>`. Une couche posée
  // pile sur CAM_Z n'appartiendrait à aucune des deux sources OBS : elle
  // disparaîtrait de l'antenne sans erreur et sans trace.
  for (const scene of SCENES) {
    const toutes = [...scene.layers, ...Object.values(scene.modes ?? {}).flat()];
    for (const couche of toutes) {
      assert.notEqual(couche.z, CAM_Z, `« ${scene.id} » pose ${couche.widget} sur le plan caméra`);
    }
  }
});

test('les deux sources OBS se partagent toutes les couches, sans doublon', () => {
  for (const scene of SCENES) {
    for (const mode of SCENE_MODES) {
      const bg = layersFor(scene, 'bg', mode.id);
      const fg = layersFor(scene, 'fg', mode.id);
      const tout = layersFor(scene, 'all', mode.id);
      assert.equal(
        bg.length + fg.length,
        tout.length,
        `« ${scene.id} » en mode ${mode.id} : des couches se perdent entre bg et fg`,
      );
    }
  }
});

test('un mode non déclaré retombe sur les couches par défaut', () => {
  // Règle de sûreté : un mode ne doit JAMAIS vider une scène. Les scènes qui
  // ignorent le moment d'émission gardent leur contenu quoi qu'on envoie.
  const compos = findScene('compos');
  assert.equal(compos.modes, undefined, 'la scène compos ne déclare pas de modes');
  for (const mode of SCENE_MODES) {
    assert.deepEqual(layersFor(compos, 'all', mode.id), layersFor(compos, 'all'));
  }
});

test('la scène de match change de contenu selon le moment, pas de décor', () => {
  const match = findScene('match');
  assert.ok(match.modes, 'la scène de match doit déclarer ses modes');

  const widgets = (mode: SceneMode): string[] =>
    layersFor(match, 'all', mode).map((l) => l.widget).sort();

  // Le décor est commun : bannière, cadre caméra, compteurs, fond.
  const decor = ['backdrop', 'score-banner', 'cam-frame', 'stream-counters', 'social'];
  for (const mode of SCENE_MODES) {
    const liste = widgets(mode.id);
    for (const piece of decor) {
      assert.ok(liste.includes(piece), `« ${piece} » manque au mode ${mode.id}`);
    }
  }

  // Et le propos change : l'avant-match montre les cotes et l'affiche, la fin
  // montre le classement. Si ces deux-là se ressemblaient, le mode ne servirait
  // à rien.
  assert.notDeepEqual(widgets('avant'), widgets('fin'));
  assert.ok(widgets('avant').includes('prematch'));
  assert.ok(widgets('fin').includes('standings'));
  assert.ok(widgets('direct').includes('multiplex'));
  assert.ok(widgets('mi-temps').includes('stats'));
});

test('le ballon a disparu du plateau, partout', () => {
  // Aucune source gratuite ne donne sa position. Un terrain avec une balle au
  // centre ferait croire qu'on suit le jeu ; c'est le mensonge le plus
  // crédible que ce plateau puisse dire, donc le plus dangereux.
  for (const scene of SCENES) {
    const toutes = [...scene.layers, ...Object.values(scene.modes ?? {}).flat()];
    for (const couche of toutes) {
      assert.notEqual(couche.widget, 'radar2d', `« ${scene.id} » affiche encore le radar`);
    }
  }
});

test('le mode par défaut existe bien dans la liste', () => {
  assert.ok(SCENE_MODES.some((m) => m.id === DEFAULT_SCENE_MODE));
});

test('une scène inconnue retombe sur le match plutôt que de casser', () => {
  assert.equal(findScene('ceci-nexiste-pas').id, 'match');
});
