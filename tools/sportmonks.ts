/**
 * L'outil Sportmonks.
 *
 * Un essai dure quatorze jours. Écrire la traduction en direct pendant un
 * match, c'est se condamner à attendre le match suivant à chaque erreur. Cet
 * outil capture la matière une fois, et on travaille ensuite contre le fichier
 * — sans réseau, sans quota, autant de fois qu'il faut.
 *
 *   pnpm sportmonks live               quels matchs sont en cours
 *   pnpm sportmonks peek <id>          capturer UNE réponse, bien formatée
 *   pnpm sportmonks record <id>        enregistrer un match entier
 *   pnpm sportmonks convert <fichier>  en faire une fixture rejouable
 *
 * Le jeton vient de SPORTMONKS_TOKEN. S'il est absent, les requêtes partent
 * sans : un mandataire réseau peut injecter l'en-tête `Authorization`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { MatchEvent } from '@kz/core';
import {
  capturerUneFois,
  nouvelEtat,
  traduire,
  SportmonksProvider,
  type SmFixture,
} from '../packages/providers/src/sportmonks/index.js';

const BASE = 'https://api.sportmonks.com/v3/football';
const TOKEN = process.env.SPORTMONKS_TOKEN;

function url(chemin: string, includes?: string): URL {
  const u = new URL(`${BASE}${chemin}`);
  if (includes) u.searchParams.set('include', includes);
  if (TOKEN) u.searchParams.set('api_token', TOKEN);
  return u;
}

async function json<T>(u: URL): Promise<T> {
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  const texte = await r.text();
  if (!r.ok) {
    const indice =
      r.status === 401 || r.status === 403
        ? "\n  → jeton absent, invalide, ou palier sans accès à cette donnée"
        : r.status === 429
          ? '\n  → quota horaire dépassé'
          : '';
    throw new Error(`Sportmonks ${r.status} : ${texte.slice(0, 200)}${indice}`);
  }
  return JSON.parse(texte) as T;
}

// ─────────────────────────────── Les commandes ──────────────────────────────

/** Quels matchs sont en cours, pour en choisir un à suivre. */
async function live(): Promise<void> {
  type Reponse = {
    data?: {
      id: number;
      name?: string;
      state?: { state?: string };
      participants?: { name?: string; meta?: { location?: string } }[];
      periods?: { ticking?: boolean; minutes?: number }[];
    }[];
    rate_limit?: { remaining?: number };
  };

  const reponse = await json<Reponse>(url('/livescores/inplay', 'participants;state;periods'));
  const matchs = reponse.data ?? [];

  if (matchs.length === 0) {
    console.log('Aucun match en cours en ce moment.');
    console.log('Les soirées de coupe d’Europe sont le meilleur moment pour capturer.');
    return;
  }

  console.log(`${matchs.length} match(s) en cours :\n`);
  for (const m of matchs) {
    const minute = m.periods?.find((p) => p.ticking)?.minutes;
    const nom = m.name ?? m.participants?.map((p) => p.name).join(' vs ') ?? '?';
    console.log(
      `  ${String(m.id).padEnd(10)} ${String(minute ?? '—').padStart(3)}'  ${nom}  [${m.state?.state ?? '?'}]`,
    );
  }
  console.log(`\nQuota restant : ${reponse.rate_limit?.remaining ?? '?'}`);
  console.log('\nEnsuite :  pnpm sportmonks peek <id>');
}

/**
 * Capture UNE réponse complète, bien formatée.
 *
 * C'est elle qui tranche les trois points que la documentation laisse dans le
 * flou : où vit « domicile / extérieur », la forme de `scores`, et la clé
 * interne de `statistics[].data`.
 */
async function peek(fixtureId: number): Promise<void> {
  const vers = `recordings/peek-${fixtureId}.json`;
  const { chemin, octets } = await capturerUneFois(fixtureId, TOKEN, vers);
  console.log(`✓ ${chemin}  (${(octets / 1024).toFixed(0)} Ko)`);

  // On traduit tout de suite : ce qui manque se voit immédiatement.
  const brut = JSON.parse(readFileSync(chemin, 'utf8')) as { data?: SmFixture };
  const etat = nouvelEtat();
  const evenements = brut.data ? traduire(brut.data, Date.now(), etat) : [];

  const parType = evenements.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + 1;
    return acc;
  }, {});

  console.log('\nTraduction de cette réponse :');
  for (const [kind, n] of Object.entries(parType)) console.log(`  ${kind.padEnd(14)} ${n}`);

  if (etat.lacunes.size > 0) {
    console.log('\n⚠ ce que la traduction n’a pas su lire :');
    for (const l of etat.lacunes) console.log(`  · ${l}`);
    console.log('\n  Ouvre le fichier pour voir la forme réelle, puis corrige');
    console.log('  packages/providers/src/sportmonks/translate.ts.');
  } else {
    console.log('\n✓ aucune lacune — la traduction lit tout ce qu’elle attend.');
  }

  const presents = Object.keys(brut.data ?? {});
  for (const attendu of ['participants', 'scores', 'periods', 'events', 'statistics', 'lineups', 'ballCoordinates']) {
    if (!presents.includes(attendu)) {
      console.log(`  · « ${attendu} » absent de la réponse${attendu === 'ballCoordinates' ? ' (palier insuffisant ?)' : ''}`);
    }
  }
}

/** Enregistre un match entier, une réponse par ligne. */
async function record(fixtureId: number, minutes: number): Promise<void> {
  const vers = `recordings/match-${fixtureId}-${new Date().toISOString().slice(0, 10)}.jsonl`;
  console.log(`Enregistrement de ${fixtureId} pendant ${minutes} min → ${vers}`);
  console.log('Ctrl+C pour arrêter plus tôt ; le fichier reste exploitable.\n');

  const provider = new SportmonksProvider({
    fixtureId,
    ...(TOKEN ? { token: TOKEN } : {}),
    withBall: true,
    recordTo: vers,
    pollMs: 10_000,
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
  const attendre = (): Promise<void> =>
    new Promise((r) => {
      const t = setInterval(() => {
        if (Date.now() >= fin) {
          clearInterval(t);
          r();
        }
      }, 1_000);
    });
  await attendre();
  await provider.stop();

  console.log(`\n\n✓ ${vers}`);
  const lacunes = provider.lacunes;
  if (lacunes.length > 0) {
    console.log('⚠ lacunes rencontrées :');
    for (const l of lacunes) console.log(`  · ${l}`);
  }
  console.log(`\nEnsuite :  pnpm sportmonks convert ${vers}`);
}

/**
 * Transforme un enregistrement en fixture rejouable.
 *
 * C'est la boucle qui se referme : un vrai match devient un match qu'on peut
 * rejouer cinquante fois, accéléré, pour éprouver l'habillage.
 */
function convert(source: string): void {
  const lignes = readFileSync(resolve(process.cwd(), source), 'utf8')
    .split('\n')
    .filter(Boolean);

  const etat = nouvelEtat();
  const evenements: MatchEvent[] = [];
  let meta: unknown = null;
  let premier = 0;

  for (const ligne of lignes) {
    let enveloppe: { at: number; brut: { data?: SmFixture } };
    try {
      enveloppe = JSON.parse(ligne) as typeof enveloppe;
    } catch {
      continue;
    }
    const fixture = enveloppe.brut?.data;
    if (!fixture) continue;
    if (premier === 0) premier = enveloppe.at;

    for (const e of traduire(fixture, enveloppe.at, etat)) {
      // Les `t` d'une fixture sont RELATIFS au coup d'envoi.
      evenements.push({ ...e, t: e.t - premier } as MatchEvent);
      if (e.kind === 'meta') meta = e.payload;
    }
  }

  if (evenements.length === 0) {
    console.error('Aucun événement traduit — le fichier est-il bien un enregistrement ?');
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
        $comment: 'Capturé sur un vrai match. Les `t` sont relatifs au premier appel.',
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

const [commande, argument, ...reste] = process.argv.slice(2);

const aide = `
  pnpm sportmonks live               quels matchs sont en cours
  pnpm sportmonks peek <id>          capturer UNE réponse et la traduire
  pnpm sportmonks record <id> [min]  enregistrer un match (90 min par défaut)
  pnpm sportmonks convert <fichier>  en faire une fixture rejouable
`;

if (!TOKEN && commande !== 'convert') {
  console.log('SPORTMONKS_TOKEN absent de l’environnement.');
  console.log('Les requêtes partiront sans jeton : elles échoueront, sauf si un');
  console.log('mandataire réseau injecte l’en-tête « Authorization » pour toi.\n');
}

try {
  switch (commande) {
    case 'live':
      await live();
      break;
    case 'peek':
      if (!argument) throw new Error('identifiant de match manquant');
      await peek(Number(argument));
      break;
    case 'record':
      if (!argument) throw new Error('identifiant de match manquant');
      await record(Number(argument), Number(reste[0] ?? 90));
      break;
    case 'convert':
      if (!argument) throw new Error('fichier manquant');
      convert(argument);
      break;
    default:
      console.log(aide);
  }
} catch (erreur) {
  console.error(`\n✗ ${erreur instanceof Error ? erreur.message : String(erreur)}`);
  process.exit(1);
}
