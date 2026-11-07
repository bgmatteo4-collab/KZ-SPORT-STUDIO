/**
 * Les invariants de la traduction ESPN.
 *
 * ── Pourquoi ces tests ne ressemblent pas aux autres ────────────────────────
 *
 * La charge utile n'est PAS synthétique. `echantillon.json` est un extrait
 * réduit d'une vraie capture : AEK Athènes – Real Madrid, Ligue des Champions,
 * 4 novembre 2026, 2-3. Les champs, les unités, les identifiants de type, les
 * libellés — tout vient de la réponse réelle d'ESPN.
 *
 * C'est important : ces tests ne vérifient pas seulement que notre logique est
 * cohérente, ils vérifient qu'elle lit la forme que l'API envoie vraiment. Un
 * test contre une charge utile imaginée d'après une documentation ne prouve
 * que notre imagination.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  americainVersDecimal,
  cleDuFait,
  lireScore,
  minuteAffichee,
  nouvelEtat,
  phaseDepuisEtat,
  scoreDansLeTexte,
  statistiques,
  tempsAdditionnel,
  traduire,
  type SourceEspn,
} from './translate.js';

/**
 * L'instant où l'on prétend interroger l'API : le lendemain du match capturé,
 * 2026-11-05T12:00:00Z. Il doit être POSTÉRIEUR au match, sinon les faits
 * horodatés par ESPN tombent dans le futur et les assertions sur l'ordre
 * chronologique n'ont plus de sens.
 */
const T = Date.parse('2026-11-05T12:00:00Z');

function echantillon(): SourceEspn {
  const brut = readFileSync(new URL('./echantillon.json', import.meta.url), 'utf8');
  return JSON.parse(brut) as SourceEspn;
}

// ───────────────────────────── Les trois invariants ──────────────────────────

test('une seconde lecture n’émet rien de nouveau', () => {
  // L'invariant qui compte le plus : ESPN renvoie l'état COMPLET à chaque
  // appel. Sans idempotence, le même but arriverait toutes les dix secondes.
  const etat = nouvelEtat();
  const premier = traduire(echantillon(), T, etat);
  assert.ok(premier.length > 0);

  const second = traduire(echantillon(), T + 10_000, etat);
  assert.deepEqual(
    second,
    [],
    `rien ne devait être réémis, reçu : ${second.map((e) => e.kind).join(', ')}`,
  );
});

test('un but présent dans les DEUX sources n’est émis qu’une fois', () => {
  // ESPN nous donne chaque fait deux fois : dans le résumé (avec identifiant)
  // et dans le tableau de bord (sans). C'est le piège qui doublerait les buts
  // à l'antenne, et la raison pour laquelle la clé d'idempotence est
  // sémantique plutôt que liée à la source.
  const src = echantillon();
  const faitsResume = (src.summary?.keyEvents ?? []).filter((k) => k.scoringPlay).length;
  const faitsBord = (src.event?.competitions?.[0]?.details ?? []).filter((d) => d.scoringPlay).length;
  assert.ok(faitsResume > 0 && faitsBord > 0, 'l’échantillon doit contenir les deux sources');

  const buts = traduire(src, T, nouvelEtat()).filter((e) => e.kind === 'goal');
  assert.equal(buts.length, 5, `cinq buts dans ce match, reçu ${buts.length}`);
});

test('le score vient du fournisseur, jamais d’une addition', () => {
  const evenements = traduire(echantillon(), T, nouvelEtat());
  const score = evenements.find((e) => e.kind === 'score');
  assert.ok(score);
  assert.deepEqual((score.payload as { score: [number, number] }).score, [2, 3]);
});

test('chaque but porte le score à SON instant, lu dans le texte d’ESPN', () => {
  // Un but affiché avec le score final serait faux pour les quatre premiers.
  // ESPN écrit le score dans son texte : « Goal! AEK Athens 1, Real Madrid 0. »
  const buts = traduire(echantillon(), T, nouvelEtat()).filter((e) => e.kind === 'goal');
  const progression = buts.map((b) => (b.payload as { score: readonly [number, number] }).score.join('-'));
  assert.deepEqual(progression, ['1-0', '1-1', '2-1', '2-2', '2-3']);
});

// ──────────────────────────────── Les faits ──────────────────────────────────

test('les buteurs sont nommés, et en nom d’antenne', () => {
  const buts = traduire(echantillon(), T, nouvelEtat()).filter((e) => e.kind === 'goal');
  const noms = buts.map((b) => (b.payload as { scorer?: { short: string } }).scorer?.short);
  assert.deepEqual(noms, ['Koita', 'Bellingham', 'Pilios', 'Mbappé', 'Valverde']);
});

test('les buts sont ordonnés dans le temps réel du match', () => {
  const buts = traduire(echantillon(), T, nouvelEtat()).filter((e) => e.kind === 'goal');
  for (let i = 1; i < buts.length; i += 1) {
    assert.ok(buts[i]!.t >= buts[i - 1]!.t, `but ${i} antérieur au précédent`);
  }
  // Et ils ne sont PAS tous ramenés à l'instant du branchement : c'est ce que
  // `wallclock` nous permet, et c'est ce qui donne les bonnes minutes quand on
  // se branche sur un match déjà commencé.
  assert.notEqual(buts[0]!.t, buts[4]!.t);
  assert.ok(buts[0]!.t < T, 'les faits passés doivent être datés dans le passé');
});

test('cartons et remplacements sont correctement typés', () => {
  const evenements = traduire(echantillon(), T, nouvelEtat());
  const cartons = evenements.filter((e) => e.kind === 'card');
  assert.equal(cartons.length, 3);
  assert.ok(cartons.some((c) => (c.payload as { card: string }).card === 'red'), 'un rouge attendu');
  assert.ok(cartons.some((c) => (c.payload as { card: string }).card === 'yellow'), 'des jaunes attendus');

  const remplacements = evenements.filter((e) => e.kind === 'substitution');
  assert.equal(remplacements.length, 9);
  assert.ok(
    remplacements.every((r) => {
      const p = r.payload as { side: string };
      return p.side === 'home' || p.side === 'away';
    }),
    'chaque remplacement doit être attribué à un camp',
  );
});

// ───────────────────────────── Le plateau et l'état ──────────────────────────

test('domicile et extérieur viennent de « homeAway », jamais de l’ordre', () => {
  const meta = traduire(echantillon(), T, nouvelEtat()).find((e) => e.kind === 'meta');
  assert.ok(meta);
  const p = meta.payload as {
    home: { abbr: string; short: string };
    away: { abbr: string };
    competition: string;
  };
  assert.equal(p.home.abbr, 'AEK');
  assert.equal(p.away.abbr, 'RMA');
  assert.equal(p.competition, 'Ligue des Champions');
});

test('les couleurs du maillot porté passent devant celles du club', () => {
  // Le résumé donne `uniform` : c'est ce que le spectateur a sous les yeux.
  const src = echantillon();
  const uniforme = src.summary?.rosters?.[0]?.uniform?.color;
  assert.ok(uniforme, 'l’échantillon doit porter un `uniform`');
  const meta = traduire(src, T, nouvelEtat()).find((e) => e.kind === 'meta');
  const p = meta!.payload as { home: { color: string } };
  assert.equal(p.home.color, `#${uniforme}`);
});

test('la composition reprend la formation calculée par ESPN', () => {
  const compos = traduire(echantillon(), T, nouvelEtat()).filter((e) => e.kind === 'lineup');
  assert.equal(compos.length, 2);
  const p = compos[0]!.payload as { formation: string; starters: unknown[] };
  // 4-4-2 dans la capture réelle. On ne la déduit pas, donc on ne peut pas se
  // tromper dessus.
  assert.equal(p.formation, '4-4-2');
  assert.ok(p.starters.length > 0);
});

test('l’horloge est lue en secondes, et le temps additionnel dans l’affichage', () => {
  // La DERNIÈRE ancre est celle du présent : les précédentes datent des faits
  // du passé, et elles sont postées à l'instant de chaque fait.
  const horloges = traduire(echantillon(), T, nouvelEtat()).filter((e) => e.kind === 'clock');
  assert.ok(horloges.length > 1, 'les faits du passé portent chacun leur ancre');
  const p = horloges[horloges.length - 1]!.payload as {
    matchMs: number;
    phase: string;
    addedMinutes?: number;
  };
  assert.equal(p.matchMs, 5_400_000, '5400 secondes = 90 minutes');
  assert.equal(p.phase, 'full_time');
  assert.equal(p.addedMinutes, 4, '« 90\'+4\' » porte le temps additionnel');
});

test('chaque but du passé est précédé d’une ancre d’horloge à SON instant', () => {
  // Le défaut que ce test empêche, et qui n'était visible que sur une capture
  // d'écran du plateau : nos événements sont triés par instant RÉEL, donc un
  // but d'il y a deux heures est réduit AVANT l'ancre d'horloge du présent.
  // Le réducteur calculait alors sa minute sur une horloge encore à zéro, et
  // les cinq buts s'affichaient « 1' ».
  const evenements = traduire(echantillon(), T, nouvelEtat());
  const buts = evenements.filter((e) => e.kind === 'goal');
  assert.equal(buts.length, 5);

  const minutes = buts.map((but) => {
    const avant = evenements.filter((e) => e.kind === 'clock' && e.t <= but.t);
    const ancre = avant[avant.length - 1];
    assert.ok(ancre, 'aucune ancre d’horloge avant ce but');
    assert.equal(ancre.t, but.t, 'l’ancre doit être posée à l’instant exact du but');
    return Math.floor((ancre.payload as { matchMs: number }).matchMs / 60_000) + 1;
  });

  // Les vraies minutes de AEK Athènes – Real Madrid, et surtout : aucune « 1 ».
  assert.deepEqual(minutes, [12, 32, 75, 78, 91]);
});

// ─────────────────────────── Les unités, le piège ────────────────────────────

test('les statistiques sortent toutes en pourcentage, pas en ratio', () => {
  // ESPN mélange les deux dans le même tableau : `possessionPct` vaut 30.4
  // mais `passPct` vaut 0.9. Recopier tel quel afficherait « 0,9 % de passes
  // réussies » à l'antenne, et personne ne l'aurait vu avant le direct.
  const etat = nouvelEtat();
  const stats = traduire(echantillon(), T, etat).find((e) => e.kind === 'stats');
  assert.ok(stats);
  const p = stats.payload as {
    possession?: [number, number];
    passAccuracy?: [number, number];
    shots?: [number, number];
  };
  assert.ok(p.possession, 'la possession doit être lue');
  assert.ok(p.possession[0] > 1 && p.possession[0] < 100, `possession hors bornes : ${p.possession[0]}`);
  assert.ok(p.passAccuracy, 'la précision de passe doit être lue');
  assert.ok(
    p.passAccuracy[0] > 50 && p.passAccuracy[0] <= 100,
    `précision de passe en ratio au lieu d’un pourcentage : ${p.passAccuracy[0]}`,
  );
  assert.ok(p.shots && p.shots[0] > 0);
});

test('l’absence d’xG est signalée, pas comblée', () => {
  const etat = nouvelEtat();
  const stats = traduire(echantillon(), T, etat).find((e) => e.kind === 'stats');
  assert.equal((stats!.payload as { xg?: unknown }).xg, undefined);
  assert.ok([...etat.lacunes].some((l) => l.includes('xG')), 'la lacune doit être inscrite');
});

test('l’absence de position de ballon est signalée, et aucun ballon n’est inventé', () => {
  const etat = nouvelEtat();
  const evenements = traduire(echantillon(), T, etat);
  assert.equal(evenements.filter((e) => e.kind === 'ball').length, 0);
  assert.ok([...etat.lacunes].some((l) => l.includes('ballon')));
});

// ──────────────────────────── Autour du match ────────────────────────────────

test('le classement et le multiplex sont lus', () => {
  const evenements = traduire(echantillon(), T, nouvelEtat());
  const classement = evenements.find((e) => e.kind === 'standings');
  assert.ok(classement);
  const rows = (classement.payload as { rows: { rank: number; points: number }[] }).rows;
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r, i) => i === 0 || r.rank >= rows[i - 1]!.rank), 'rangs croissants');

  const autres = evenements.find((e) => e.kind === 'other_matches');
  assert.ok(autres);
  assert.ok((autres.payload as { matches: unknown[] }).matches.length > 0);
});

test('les cotes américaines deviennent des cotes décimales', () => {
  assert.equal(americainVersDecimal(-550), 1.18);
  assert.equal(americainVersDecimal(250), 3.5);
  assert.equal(americainVersDecimal(100), 2);
  assert.equal(americainVersDecimal(0), null);
});

// ────────────────────────────── Les petites pièces ───────────────────────────

test('les états se traduisent en périodes sans dépendre d’une énumération', () => {
  assert.equal(phaseDepuisEtat({ type: { state: 'pre' } }), 'pre');
  assert.equal(phaseDepuisEtat({ type: { state: 'in' }, period: 1 }), 'first_half');
  assert.equal(phaseDepuisEtat({ type: { state: 'in' }, period: 2 }), 'second_half');
  assert.equal(phaseDepuisEtat({ type: { state: 'in', name: 'STATUS_HALFTIME' } }), 'half_time');
  assert.equal(phaseDepuisEtat({ type: { state: 'in' }, period: 5 }), 'penalties');
  assert.equal(phaseDepuisEtat({ type: { state: 'post', name: 'STATUS_FULL_TIME' } }), 'full_time');
  // Un `name` inconnu ne doit pas faire dérailler : `state` et `period` suffisent.
  assert.equal(phaseDepuisEtat({ type: { state: 'in', name: 'STATUS_SOMETHING_NEW' }, period: 2 }), 'second_half');
});

test('le temps additionnel ne vit que dans l’affichage', () => {
  assert.equal(tempsAdditionnel("90'+4'"), 4);
  assert.equal(tempsAdditionnel("45'+2'"), 2);
  assert.equal(tempsAdditionnel("67'"), null);
  assert.equal(tempsAdditionnel(undefined), null);
});

test('la minute d’antenne d’un autre match', () => {
  assert.equal(minuteAffichee({ type: { state: 'in' }, period: 2, displayClock: "69'" }), '69');
  assert.equal(minuteAffichee({ type: { state: 'in' }, period: 1, displayClock: "45'+2'" }), '45+2');
  assert.equal(minuteAffichee({ type: { state: 'in', name: 'STATUS_HALFTIME' } }), 'MT');
  assert.equal(minuteAffichee({ type: { state: 'post', name: 'STATUS_FULL_TIME' } }), 'FIN');
  assert.equal(minuteAffichee({ type: { state: 'pre' } }), '—');
});

test('le score se lit dans le texte, dans les deux ordres', () => {
  assert.deepEqual(
    scoreDansLeTexte('Goal! AEK Athens 1, Real Madrid 0.', 'AEK Athens', 'Real Madrid'),
    [1, 0],
  );
  assert.deepEqual(
    scoreDansLeTexte('Goal! Real Madrid 3, AEK Athens 2.', 'AEK Athens', 'Real Madrid'),
    [2, 3],
  );
  assert.equal(scoreDansLeTexte('Goal!', 'AEK Athens', 'Real Madrid'), null);
});

test('la clé d’un fait ne dépend pas de la source qui l’a apporté', () => {
  const joueur = { id: '42', name: 'X', short: 'X', number: 9 };
  const duResume = cleDuFait({ id: '54800396', clock: { value: 671 }, team: { id: '887' } }, 'but', joueur);
  const duBord = cleDuFait({ clock: { value: 671 }, team: { id: '887' } }, 'but', joueur);
  assert.equal(duResume, duBord, 'les deux sources doivent produire la même clé');
});

test('lireScore exige les deux camps', () => {
  assert.deepEqual(lireScore([{ homeAway: 'home', score: '2' }, { homeAway: 'away', score: '1' }]), [2, 1]);
  assert.equal(lireScore([{ homeAway: 'home', score: '2' }]), null);
  assert.equal(lireScore([]), null);
  assert.equal(lireScore(undefined), null);
});

test('une réponse vide ne fait rien exploser', () => {
  // Règle n°6, côté données : pas de donnée, pas d'événement, jamais d'erreur.
  const etat = nouvelEtat();
  assert.doesNotThrow(() => traduire({}, T, etat));
  assert.doesNotThrow(() => traduire({ event: {} }, T, etat));
  assert.doesNotThrow(() => traduire({ event: { competitions: [{}] }, summary: {} }, T, etat));
  assert.equal(statistiques(undefined, etat), null);
  assert.equal(statistiques([], etat), null);
});
