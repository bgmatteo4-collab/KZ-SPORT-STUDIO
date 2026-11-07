import assert from 'node:assert/strict';
import test from 'node:test';
import { directionDuCreneau, memeEndroit } from './mouvement.js';

// Les créneaux réels de l'habillage, relevés dans `scenes.ts`. Les tester sur
// des valeurs inventées ne prouverait rien : c'est exactement sur les cas
// réels que l'heuristique précédente se trompait.
const COLONNE_GAUCHE = { x: 0.008, y: 0.172, w: 0.236, h: 0.715 };
const COLONNE_DROITE = { x: 0.746, y: 0.172, w: 0.246, h: 0.478 };
const BANNIERE_HAUT = { x: 0.008, y: 0.01, w: 0.984, h: 0.142 };
const BANDEAU_BAS = { x: 0.272, y: 0.648, w: 0.456, h: 0.322 };
const PLEIN_PRINCIPAL = { x: 0.012, y: 0.172, w: 0.598, h: 0.8 };
const PLEIN_SECONDAIRE = { x: 0.622, y: 0.172, w: 0.366, h: 0.468 };

test('une colonne latérale entre par son bord', () => {
  assert.equal(directionDuCreneau(COLONNE_GAUCHE), 'gauche');
  assert.equal(directionDuCreneau(COLONNE_DROITE), 'droite');
  assert.equal(directionDuCreneau(PLEIN_SECONDAIRE), 'droite');
});

test('une bande qui traverse l’écran entre par le haut ou par le bas', () => {
  // Ses deux écarts latéraux valent presque zéro : prendre le plus petit des
  // quatre la ferait entrer par la gauche, ce qui n'a aucun sens pour une
  // bannière collée en haut de l'écran.
  assert.equal(directionDuCreneau(BANNIERE_HAUT), 'haut');
  assert.equal(
    directionDuCreneau({ x: 0.008, y: 0.88, w: 0.984, h: 0.1 }),
    'bas',
  );
});

test('un grand panneau collé à gauche entre par la gauche, pas par le bas', () => {
  // Le défaut de la première version : elle décidait par le CENTRE. Le
  // multiplex plein cadre, dont le centre tombe en bas de l'écran, montait
  // donc de vingt-huit pixels alors qu'il touche le bord gauche.
  assert.equal(directionDuCreneau(PLEIN_PRINCIPAL), 'gauche');
});

test('un bandeau central bas entre par le bas', () => {
  assert.equal(directionDuCreneau(BANDEAU_BAS), 'bas');
});

test('deux créneaux au même endroit sont reconnus malgré quelques millièmes', () => {
  // Le cas qui a motivé la fonction : les statistiques en x = 0,008 remplacées
  // par le multiplex en x = 0,012. Égalité stricte : faux. Même endroit à
  // l'écran : évidemment oui.
  assert.equal(
    memeEndroit(COLONNE_GAUCHE, { x: 0.012, y: 0.172, w: 0.236, h: 0.715 }),
    true,
  );
});

test('deux colonnes opposées ne sont pas au même endroit', () => {
  assert.equal(memeEndroit(COLONNE_GAUCHE, COLONNE_DROITE), false);
});

test('un créneau contenu dans un autre compte comme le même endroit', () => {
  // Un insert plus court que la colonne qu'il remplace reste « à la place
  // de » : c'est la moitié du PLUS PETIT des deux qui décide, sinon un petit
  // panneau posé dans un grand ne déclencherait jamais le chevauchement.
  assert.equal(memeEndroit(COLONNE_GAUCHE, { x: 0.008, y: 0.172, w: 0.236, h: 0.3 }), true);
});

test('un créneau vide ne se superpose à rien', () => {
  assert.equal(memeEndroit(COLONNE_GAUCHE, { x: 0.008, y: 0.172, w: 0, h: 0 }), false);
});
