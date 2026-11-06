/**
 * L'outil ESPN.
 *
 * Même surface que `pnpm sportmonks`, volontairement : il n'y a rien de
 * nouveau à apprendre quand on change de source.
 *
 *   pnpm espn live                      quels matchs sont en cours, partout
 *   pnpm espn jour [ligue]              la soirée d'un championnat
 *   pnpm espn peek <ligue> <id>         capturer UNE réponse et la traduire
 *   pnpm espn record <ligue> <id> [min] enregistrer un match
 *   pnpm espn convert <fichier>         en faire une fixture rejouable
 *
 * Aucun jeton. L'API d'ESPN est publique — et non documentée : voir la note en
 * tête de `packages/providers/src/espn/index.ts` sur ce que ça implique.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MatchEvent } from '@kz/core';
import {
  capturerUneFois,
  EspnProvider,
  LIGUES,
  matchsEnCours,
  nouvelEtat,
  tableauDeBord,
  traduire,
  type SourceEspn,
} from '../packages/providers/src/espn/index.js';

// ─────────────────────────────── Les commandes ──────────────────────────────

/** Quels matchs sont en cours, pour en choisir un à suivre. */
async function live(): Promise<void> {
  const matchs = await matchsEnCours();
  if (matchs.length === 0) {
    console.log('Aucun match en cours dans les championnats suivis.');
    console.log('\nPour voir la soirée d’un championnat :  pnpm espn jour fra.1');
    console.log('Championnats connus :', Object.keys(LIGUES).join(', '));
    return;
  }

  console.log(`${matchs.length} match(s) en cours :\n`);
  for (const m of matchs) {
    const st = m.event.status ?? m.event.competitions?.[0]?.status;
    const noms = (m.event.competitions?.[0]?.competitors ?? [])
      .map((c) => `${c.team?.displayName ?? '?'} ${c.score ?? ''}`)
      .join(' — ');
    console.log(
      `  ${(m.event.id ?? '?').padEnd(11)} ${(st?.displayClock ?? '—').padStart(7)}  ${noms}`,
    );
    console.log(`              ${m.nom}  ·  pnpm espn peek ${m.ligue} ${m.event.id ?? ''}`);
  }
}

/** La soirée d'un championnat, en cours ou non. */
async function jour(ligue: string): Promise<void> {
  const bord = await tableauDeBord(ligue);
  const matchs = bord.events ?? [];
  console.log(`${LIGUES[ligue]?.nom ?? ligue} — ${matchs.length} match(s) :\n`);
  for (const e of matchs) {
    const st = e.status ?? e.competitions?.[0]?.status;
    console.log(
      `  ${(e.id ?? '?').padEnd(11)} ${(st?.type?.detail ?? '?').padEnd(28)} ${e.name ?? '?'}`,
    );
  }
  console.log(`\nEnsuite :  pnpm espn peek ${ligue} <id>`);
}

/** Capture UNE réponse complète, la traduit, et dit ce qui manque. */
async function peek(ligue: string, eventId: string): Promise<void> {
  const vers = `recordings/espn-peek-${eventId}.json`;
  const { chemin, octets, src } = await capturerUneFois(ligue, eventId, vers);
  console.log(`✓ ${chemin}  (${(octets / 1024).toFixed(0)} Ko)`);

  const etat = nouvelEtat();
  const evenements = traduire(src, Date.now(), etat);
  resumer(evenements, etat.lacunes);

  // Un second passage doit ne RIEN produire : c'est l'invariant d'idempotence,
  // et c'est l'erreur qui coûte le plus cher en direct.
  const second = traduire(src, Date.now() + 10_000, etat);
  console.log(
    second.length === 0
      ? '\n✓ idempotence : une seconde lecture n’émet rien'
      : `\n⚠ idempotence rompue : ${second.map((e) => e.kind).join(', ')}`,
  );
}

function resumer(evenements: MatchEvent[], lacunes: Set<string>): void {
  const parType = evenements.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\nTraduction — ${evenements.length} événements :`);
  for (const [kind, n] of Object.entries(parType)) console.log(`  ${kind.padEnd(14)} ${n}`);

  const meta = evenements.find((e) => e.kind === 'meta');
  if (meta) {
    const p = meta.payload as { home: { short: string; abbr: string }; away: { short: string; abbr: string }; competition: string };
    console.log(`\n  ${p.home.short} (${p.home.abbr}) vs ${p.away.short} (${p.away.abbr})  ·  ${p.competition}`);
  }
  const score = evenements.find((e) => e.kind === 'score');
  if (score) console.log(`  score : ${(score.payload as { score: [number, number] }).score.join(' – ')}`);
  for (const e of evenements.filter((x) => x.kind === 'goal')) {
    const p = e.payload as { side: string; scorer?: { short: string }; score: [number, number] };
    console.log(`  but   : ${p.scorer?.short ?? '?'} (${p.side}) → ${p.score.join('-')}`);
  }

  if (lacunes.size > 0) {
    console.log('\n⚠ ce que la traduction n’a pas su lire :');
    for (const l of lacunes) console.log(`  · ${l}`);
  } else {
    console.log('\n✓ aucune lacune.');
  }
}

/** Enregistre un match, une réponse par ligne. */
async function record(ligue: string, eventId: string, minutes: number): Promise<void> {
  const vers = `recordings/espn-${eventId}-${new Date().toISOString().slice(0, 10)}.jsonl`;
  console.log(`Enregistrement de ${eventId} (${ligue}) pendant ${minutes} min → ${vers}`);
  console.log('Ctrl+C pour arrêter plus tôt ; le fichier reste exploitable.\n');

  const provider = new EspnProvider({
    ligue,
    eventId,
    avecMultiplex: true,
    recordTo: vers,
    pollMs: 10_000,
    summaryMs: 30_000,
  });

  let total = 0;
  await provider.start(
    (evenements) => {
      total += evenements.length;
      const resume = evenements.map((e) => e.kind).join(', ');
      process.stdout.write(`\r  ${total} événements — derniers : ${resume.slice(0, 60)}        `);
    },
    { now: () => Date.now(), scale: 1 },
  );

  const fin = Date.now() + minutes * 60_000;
  await new Promise<void>((r) => {
    const t = setInterval(() => {
      if (Date.now() >= fin) {
        clearInterval(t);
        r();
      }
    }, 1_000);
  });
  await provider.stop();

  console.log(`\n\n✓ ${vers}`);
  for (const l of provider.lacunes) console.log(`  · ${l}`);
  console.log(`\nEnsuite :  pnpm espn convert ${vers}`);
}

/**
 * Transforme un enregistrement en fixture rejouable.
 *
 * C'est la boucle qui se referme : un vrai match devient un match qu'on peut
 * rejouer cinquante fois, accéléré, pour éprouver l'habillage sans réseau.
 */
function convert(source: string): void {
  const lignes = readFileSync(resolve(process.cwd(), source), 'utf8').split('\n').filter(Boolean);

  const etat = nouvelEtat();
  const evenements: MatchEvent[] = [];
  let meta: unknown = null;
  let premier = 0;

  for (const ligne of lignes) {
    let enveloppe: { at: number; src: SourceEspn };
    try {
      enveloppe = JSON.parse(ligne) as typeof enveloppe;
    } catch {
      continue;
    }
    if (!enveloppe.src) continue;
    if (premier === 0) premier = enveloppe.at;

    for (const e of traduire(enveloppe.src, enveloppe.at, etat)) {
      // Les `t` d'une fixture sont RELATIFS au coup d'envoi.
      evenements.push({ ...e, t: e.t - premier } as MatchEvent);
      if (e.kind === 'meta') meta = e.payload;
    }
  }

  if (evenements.length === 0) {
    console.error('Aucun événement traduit — le fichier est-il bien un enregistrement ESPN ?');
    process.exit(1);
  }

  evenements.sort((a, b) => a.t - b.t || a.seq - b.seq);
  evenements.forEach((e, i) => {
    (e as { seq: number }).seq = i;
  });

  const nom = source.split('/').pop()?.replace('.jsonl', '') ?? 'reel';
  const vers = resolve(process.cwd(), `fixtures/${nom}.json`);
  mkdirSync(dirname(vers), { recursive: true });
  writeFileSync(
    vers,
    JSON.stringify(
      {
        $comment: 'Capturé sur un vrai match, via ESPN. Les `t` sont relatifs au premier appel.',
        meta,
        durationMs: evenements[evenements.length - 1]!.t + 60_000,
        events: evenements,
      },
      null,
      0,
    ),
  );

  const parType = evenements.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`✓ fixtures/${nom}.json — ${evenements.length} événements`);
  console.log('  ', JSON.stringify(parType));
  console.log(`\nEnsuite :  KZ_FIXTURE=fixtures/${nom}.json pnpm dev`);
}

// ──────────────────────────────────── Main ──────────────────────────────────

const [commande, a, b, ...reste] = process.argv.slice(2);

const aide = `
  pnpm espn live                      quels matchs sont en cours, partout
  pnpm espn jour [ligue]              la soirée d'un championnat
  pnpm espn peek <ligue> <id>         capturer UNE réponse et la traduire
  pnpm espn record <ligue> <id> [min] enregistrer un match
  pnpm espn convert <fichier>         en faire une fixture rejouable

  Championnats : ${Object.keys(LIGUES).join(', ')}
`;

try {
  switch (commande) {
    case 'live':
      await live();
      break;
    case 'jour':
      await jour(a ?? 'fra.1');
      break;
    case 'peek':
      if (!a || !b) throw new Error('usage : pnpm espn peek <ligue> <id>');
      await peek(a, b);
      break;
    case 'record':
      if (!a || !b) throw new Error('usage : pnpm espn record <ligue> <id> [minutes]');
      await record(a, b, Number(reste[0] ?? 120));
      break;
    case 'convert':
      if (!a) throw new Error('fichier manquant');
      convert(a);
      break;
    default:
      console.log(aide);
  }
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exit(1);
}
