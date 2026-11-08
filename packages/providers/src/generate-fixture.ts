/**
 * Génère un match complet et réaliste dans `fixtures/`.
 *
 * Pourquoi c'est la première chose qu'on écrit : on ne débuggue pas un habillage
 * à 21 h un soir de Ligue des Champions. Un match rejouable, c'est un match
 * qu'on peut repasser cinquante fois, accéléré, jusqu'à ce que tout soit juste.
 *
 *   pnpm fixture
 *
 * Les `t` sont relatifs au coup d'envoi. Le rejoueur les ramène en absolu.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  CardKind,
  Confrontation,
  LineupPayload,
  MatchEvent,
  MatchMeta,
  MatchPhase,
  Odds,
  OtherMatch,
  Pair,
  Player,
  RencontrePassee,
  Side,
  StandingRow,
  Team,
  TeamBrief,
} from '@kz/core';

// ─────────────────────────── Aléatoire reproductible ──────────────────────────
// Même graine, même match. Un bug trouvé reste trouvable.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260512);
const chance = (p: number) => rand() < p;
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;

// ───────────────────────────────── Les équipes ────────────────────────────────

const HOME: Team = {
  id: 'rma',
  name: 'Real Madrid Club de Fútbol',
  short: 'Real Madrid',
  abbr: 'RMA',
  color: '#ffffff',
  colorAlt: '#1b2d6b',
  kit: 'plain',
};

const AWAY: Team = {
  id: 'mci',
  name: 'Manchester City FC',
  short: 'Man City',
  abbr: 'MCI',
  color: '#6cabdd',
  colorAlt: '#1c2c5b',
  kit: 'plain',
};

const squad = (names: readonly [number, string, string][]): Player[] =>
  names.map(([number, name, position]) => ({
    id: `${name.toLowerCase().replace(/[^a-z]/g, '')}`,
    name,
    short: name.split(' ').pop()!,
    number,
    position,
  }));

const HOME_XI = squad([
  [1, 'Andriy Lunin', 'G'],
  [2, 'Dani Carvajal', 'D'],
  [3, 'Éder Militão', 'D'],
  [4, 'Antonio Rüdiger', 'D'],
  [23, 'Ferland Mendy', 'D'],
  [8, 'Federico Valverde', 'M'],
  [15, 'Arda Güler', 'M'],
  [10, 'Luka Modrić', 'M'],
  [11, 'Rodrygo', 'A'],
  [7, 'Vinícius Júnior', 'A'],
  [9, 'Kylian Mbappé', 'A'],
]);

const HOME_BENCH = squad([
  [13, 'Thibaut Courtois', 'G'],
  [6, 'Nacho Fernández', 'D'],
  [14, 'Aurélien Tchouaméni', 'M'],
  [5, 'Jude Bellingham', 'M'],
  [21, 'Brahim Díaz', 'A'],
  [19, 'Dani Ceballos', 'M'],
]);

const AWAY_XI = squad([
  [31, 'Ederson Moraes', 'G'],
  [2, 'Kyle Walker', 'D'],
  [3, 'Rúben Dias', 'D'],
  [5, 'John Stones', 'D'],
  [24, 'Josko Gvardiol', 'D'],
  [16, 'Rodri Hernández', 'M'],
  [8, 'Mateo Kovačić', 'M'],
  [20, 'Bernardo Silva', 'M'],
  [47, 'Phil Foden', 'A'],
  [10, 'Jack Grealish', 'A'],
  [9, 'Erling Haaland', 'A'],
]);

const AWAY_BENCH = squad([
  [18, 'Stefan Ortega', 'G'],
  [25, 'Manuel Akanji', 'D'],
  [19, 'Julián Álvarez', 'A'],
  [27, 'Matheus Nunes', 'M'],
  [52, 'Oscar Bobb', 'A'],
  [82, 'Rico Lewis', 'D'],
]);

const META: MatchMeta = {
  id: 'demo-ucl-2026',
  competition: 'Ligue des Champions — Quart de finale',
  competitionTheme: 'ucl',
  round: 'Quart de finale, match retour',
  venue: 'Santiago Bernabéu',
  home: HOME,
  away: AWAY,
  // 21 h 00, heure de Paris : l'heure d'un match de coupe d'Europe.
  kickoff: Date.UTC(2026, 3, 14, 19, 0, 0),
};

// ───────────────────────── Le scénario des temps forts ────────────────────────
// Scripté volontairement : on veut un match qui éprouve TOUS les cas
// d'affichage — un but en toute fin de temps additionnel, un carton rouge,
// une égalisation, du temps additionnel long.

type Scripted =
  | { at: number; kind: 'goal'; side: Side; scorer: Player; assist?: Player; penalty?: boolean }
  | { at: number; kind: 'card'; side: Side; player: Player; card: CardKind }
  | { at: number; kind: 'sub'; side: Side; out: Player; in: Player };

const MIN = 60_000;

const SCRIPT: Scripted[] = [
  { at: 23 * MIN + 14_000, kind: 'goal', side: 'home', scorer: HOME_XI[10]!, assist: HOME_XI[9]! },
  { at: 35 * MIN + 41_000, kind: 'card', side: 'away', player: AWAY_XI[5]!, card: 'yellow' },
  { at: 41 * MIN + 8_000, kind: 'goal', side: 'away', scorer: AWAY_XI[10]!, assist: AWAY_XI[8]! },
  { at: 58 * MIN + 32_000, kind: 'goal', side: 'home', scorer: HOME_XI[9]!, penalty: true },
  { at: 61 * MIN, kind: 'sub', side: 'away', out: AWAY_XI[9]!, in: AWAY_BENCH[2]! },
  { at: 61 * MIN + 20_000, kind: 'sub', side: 'home', out: HOME_XI[7]!, in: HOME_BENCH[3]! },
  { at: 67 * MIN + 11_000, kind: 'card', side: 'home', player: HOME_XI[5]!, card: 'yellow' },
  { at: 72 * MIN + 5_000, kind: 'sub', side: 'home', out: HOME_XI[6]!, in: HOME_BENCH[2]! },
  { at: 78 * MIN + 48_000, kind: 'card', side: 'away', player: AWAY_XI[1]!, card: 'red' },
  { at: 84 * MIN + 2_000, kind: 'sub', side: 'away', out: AWAY_XI[3]!, in: AWAY_BENCH[1]! },
  // L'égalisation à 90+4 : le cas qui casse tous les chronos mal faits.
  { at: 93 * MIN + 51_000, kind: 'goal', side: 'away', scorer: AWAY_BENCH[2]!, assist: AWAY_XI[8]! },
];

const STOPPAGE_1 = 2 * MIN + 40_000;
const STOPPAGE_2 = 5 * MIN + 10_000;
const HALF_TIME_BREAK = 15 * MIN;

// ─────────────────── Les autres matchs, le classement, les cotes ──────────────
// Ce sont les panneaux latéraux du plateau. Sans eux, l'habillage est nu.

const BRIEF = (abbr: string, short: string, color: string, colorAlt?: string): TeamBrief => ({
  abbr,
  short,
  color,
  ...(colorAlt ? { colorAlt } : {}),
});

const MULTIPLEX_TEAMS: [TeamBrief, TeamBrief][] = [
  [BRIEF('OM', 'Marseille', '#2fb5e3', '#ffffff'), BRIEF('NEW', 'Newcastle', '#241f20', '#ffffff')],
  [BRIEF('MCI', 'Man City', '#6cabdd'), BRIEF('LEV', 'Leverkusen', '#e32221', '#101010')],
  [BRIEF('NAP', 'Naples', '#12a0d7'), BRIEF('QAR', 'Qarabag', '#164c9b')],
  [BRIEF('BOD', 'Bodø/Glimt', '#fdd500', '#000000'), BRIEF('JUV', 'Juventus', '#101010', '#ffffff')],
  [BRIEF('DOR', 'Dortmund', '#fde100', '#101010'), BRIEF('VIL', 'Villarreal', '#ffe667')],
  [BRIEF('SLA', 'Slavia Prague', '#d7141a', '#ffffff'), BRIEF('ATH', 'Athletic Club', '#ee2523', '#ffffff')],
  [BRIEF('INT', 'Inter', '#0068a8', '#010e80'), BRIEF('ARS', 'Arsenal', '#ef0107', '#ffffff')],
  [BRIEF('BAR', 'Barcelone', '#a50044', '#004d98'), BRIEF('BRU', 'Bruges', '#1e4ba0', '#000000')],
  [BRIEF('BAY', 'Bayern', '#dc052d', '#ffffff'), BRIEF('SPO', 'Sporting', '#008057', '#ffffff')],
  [BRIEF('ATM', 'Atlético', '#cb3524', '#ffffff'), BRIEF('PSV', 'PSV', '#ed1c24', '#ffffff')],
  [BRIEF('BEN', 'Benfica', '#e00000', '#ffffff'), BRIEF('MON', 'Monaco', '#e63946', '#ffffff')],
  [BRIEF('GAL', 'Galatasaray', '#a90432', '#fdb913'), BRIEF('AJX', 'Ajax', '#d2122e', '#ffffff')],
];

const multiplexScores = MULTIPLEX_TEAMS.map(() => [0, 0] as [number, number]);

function multiplexAt(matchMs: number): OtherMatch[] {
  return MULTIPLEX_TEAMS.map(([home, away], i) => {
    // Les autres matchs ne sont pas synchrones avec le nôtre : décalage par match.
    const offset = (i * 7 - 10) * MIN;
    const theirMs = matchMs + offset;
    if (theirMs > 0 && chance(0.0016)) {
      multiplexScores[i]![chance(0.5) ? 0 : 1] += 1;
    }
    const minute =
      theirMs <= 0 ? '—' : theirMs >= 90 * MIN ? 'FIN' : String(Math.floor(theirMs / MIN) + 1);
    /*
     * Les chiffres de la rencontre, pour que la mosaïque ait de quoi vivre
     * hors ligne. Ils sont DÉRIVÉS du temps écoulé et du score, pas tirés au
     * sort à chaque image : une fiche dont la possession saute de 40 % à
     * 70 % toutes les secondes rend la page impossible à juger, et c'est
     * justement sur ce jeu de démonstration qu'on juge la mise en page.
     *
     * Un match qui n'a pas commencé n'a pas de chiffres — c'est le cas qu'il
     * faut pouvoir regarder, puisque c'est celui où la fiche doit se réduire
     * à son score sans laisser de barres à zéro.
     */
    const dom = multiplexScores[i]![0];
    const ext = multiplexScores[i]![1];
    const minutes = Math.max(0, Math.floor(theirMs / MIN));
    const stats =
      theirMs <= 0
        ? undefined
        : {
            possession: [50 + ((i * 7) % 19) - 9, 50 - ((i * 7) % 19) + 9] as Pair,
            shots: [Math.round(minutes * 0.14) + dom * 2, Math.round(minutes * 0.12) + ext * 2] as Pair,
            shotsOnTarget: [Math.round(minutes * 0.05) + dom, Math.round(minutes * 0.04) + ext] as Pair,
            corners: [Math.round(minutes * 0.06), Math.round(minutes * 0.05)] as Pair,
          };
    return {
      id: `mx-${i}`,
      minute,
      live: theirMs > 0 && theirMs < 90 * MIN,
      home,
      away,
      score: [dom, ext] as Pair,
      ...(stats ? { stats } : {}),
    };
  });
}

/**
 * Un vrai classement, sur vingt lignes : la mise en page d'antenne est à deux
 * colonnes, donc six lignes ne prouvent rien.
 */
const TABLE: [string, string, string, string | undefined, number, number][] = [
  ['MCI', 'Man City', '#6cabdd', undefined, 11, 18],
  ['ARS', 'Arsenal', '#ef0107', '#ffffff', 5, 15],
  ['BHA', 'Brighton', '#0057b8', '#ffffff', 13, 13],
  ['BRE', 'Brentford', '#e30613', '#ffffff', 6, 10],
  ['EVE', 'Everton', '#003399', undefined, 3, 10],
  ['CHE', 'Chelsea', '#034694', undefined, 2, 10],
  ['LEE', 'Leeds', '#ffcd00', '#1d428a', 3, 9],
  ['HUL', 'Hull City', '#f5a12d', '#000000', -1, 9],
  ['LIV', 'Liverpool', '#c8102e', undefined, -2, 9],
  ['IPS', 'Ipswich', '#1b4ea1', '#ffffff', -4, 9],
  ['NEW', 'Newcastle', '#241f20', '#ffffff', 0, 8],
  ['CRY', 'Crystal Palace', '#1b458f', '#c4122e', -3, 7],
  ['MUN', 'Man United', '#da020e', '#000000', 0, 6],
  ['NFO', 'Nottingham', '#dd0000', '#ffffff', -3, 5],
  ['AVL', 'Aston Villa', '#670e36', '#95bfe5', -5, 5],
  ['SUN', 'Sunderland', '#eb172b', '#ffffff', -6, 4],
  ['BOU', 'Bournemouth', '#da291c', '#000000', -6, 3],
  ['TOT', 'Tottenham', '#132257', '#ffffff', -7, 3],
  ['COV', 'Coventry', '#78d2eb', '#000000', -9, 3],
  ['FUL', 'Fulham', '#000000', '#ffffff', -11, 2],
];

const STANDINGS: StandingRow[] = TABLE.map(([abbr, short, color, alt, diff, points], i) => {
  // Le bilan détaillé est DÉDUIT des points, pas tiré au sort : 3 par
  // victoire, 1 par nul. Un jeu de démonstration dont les colonnes ne
  // s'additionnent pas est pire qu'un jeu pauvre — on passe une heure à
  // chercher un bogue de calcul qui n'existe pas.
  const won = Math.floor(points / 3);
  const drawn = points - won * 3;
  const lost = Math.max(0, 6 - won - drawn);
  return {
    rank: i + 1,
    team: BRIEF(abbr, short, color, alt),
    played: 6,
    diff,
    points,
    won,
    drawn,
    lost,
    goalsFor: Math.max(0, won * 2 + drawn + Math.max(0, diff)),
    goalsAgainst: Math.max(0, won * 2 + drawn + Math.max(0, diff) - diff),
    // Quatre qualifiés, un barragiste, trois relégables : les zones habituelles.
    zone: (i < 4 ? 'win' : i === 4 ? 'play' : i >= 17 ? 'lose' : null) as StandingRow['zone'],
  };
});

/**
 * La forme et le face-à-face, pour que la scène Confrontation ait de quoi
 * vivre hors ligne. Les scores sont inventés, les équipes non : elles sont
 * prises dans le tableau ci-dessus, donc les écussons et les couleurs sont
 * ceux du reste du plateau.
 */
const JOUR = 24 * 60 * 60 * 1000;

function sortie(
  joursAvant: number,
  adversaire: TeamBrief,
  domicile: boolean,
  pour: number,
  contre: number,
): RencontrePassee {
  return {
    t: Date.now() - joursAvant * JOUR,
    adversaire,
    domicile,
    score: [pour, contre] as Pair,
    resultat: pour > contre ? 'V' : pour < contre ? 'D' : 'N',
    competition: 'Premier League',
  };
}

const EQ = (abbr: string): TeamBrief => {
  const ligne = TABLE.find((t) => t[0] === abbr) ?? TABLE[0]!;
  return BRIEF(ligne[0], ligne[1], ligne[2], ligne[3]);
};

const CONFRONTATION: Confrontation = {
  forme: {
    home: [
      sortie(5, EQ('ARS'), false, 1, 1),
      sortie(12, EQ('BRE'), true, 3, 0),
      sortie(19, EQ('CHE'), false, 0, 2),
      sortie(26, EQ('EVE'), true, 2, 1),
      sortie(33, EQ('LIV'), true, 4, 1),
    ],
    away: [
      sortie(5, EQ('TOT'), true, 2, 0),
      sortie(12, EQ('NEW'), false, 1, 1),
      sortie(19, EQ('AVL'), true, 3, 1),
      sortie(26, EQ('FUL'), false, 2, 2),
      sortie(33, EQ('MUN'), true, 1, 0),
    ],
  },
  // Vues du DOMICILE, de la plus récente à la plus ancienne.
  face: [
    sortie(120, BRIEF(AWAY.abbr, AWAY.short, AWAY.color, AWAY.colorAlt), false, 1, 1),
    sortie(310, BRIEF(AWAY.abbr, AWAY.short, AWAY.color, AWAY.colorAlt), true, 3, 1),
    sortie(480, BRIEF(AWAY.abbr, AWAY.short, AWAY.color, AWAY.colorAlt), false, 0, 2),
    sortie(690, BRIEF(AWAY.abbr, AWAY.short, AWAY.color, AWAY.colorAlt), true, 2, 2),
    sortie(880, BRIEF(AWAY.abbr, AWAY.short, AWAY.color, AWAY.colorAlt), false, 1, 0),
  ],
};

/** Les cotes bougent avec le score : c'est tout l'intérêt d'une cote « live ». */
function oddsAt(score: Pair, matchMs: number): Odds {
  const lead = score[0] - score[1];
  const left = Math.max(0.05, 1 - matchMs / (95 * MIN));
  // Le Real reçoit : favori à l'ouverture, autour de 2,05 contre 3,40.
  const home = Math.max(1.01, 2.05 - lead * 0.85 + (1 - left) * (lead > 0 ? -0.75 : 2.4));
  const away = Math.max(1.01, 3.4 + lead * 1.1 + (1 - left) * (lead < 0 ? -1.4 : 2.6));
  const draw = Math.max(1.01, 3.3 + Math.abs(lead) * 1.7 - left * 0.3);
  return {
    home: Number(home.toFixed(2)),
    draw: Number(draw.toFixed(2)),
    away: Number(away.toFixed(2)),
    bookmaker: 'Bookmaker',
  };
}

let viewers = 18_400;
let likes = 5_900;

function audienceAt(): { viewers: number; likes: number } {
  viewers = Math.max(1200, Math.round(viewers + between(-280, 460)));
  likes = Math.round(likes + between(0, 42));
  return { viewers, likes };
}

// ──────────────────────────────── La simulation ───────────────────────────────

const events: MatchEvent[] = [];
let seq = 0;

function push<K extends MatchEvent['kind']>(
  t: number,
  kind: K,
  payload: Extract<MatchEvent, { kind: K }>['payload'],
): void {
  events.push({ seq: seq++, t: Math.round(t), kind, payload } as MatchEvent);
}

const score: [number, number] = [0, 0];
const stats = {
  possession: [50, 50] as [number, number],
  shots: [0, 0] as [number, number],
  shotsOnTarget: [0, 0] as [number, number],
  corners: [0, 0] as [number, number],
  fouls: [0, 0] as [number, number],
  offsides: [0, 0] as [number, number],
  xg: [0, 0] as [number, number],
  passes: [0, 0] as [number, number],
};

const idx = (s: Side) => (s === 'home' ? 0 : 1);
const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');

// État du jeu courant
let possession: Side = 'home';
let intensity: 'none' | 'attack' | 'dangerous' = 'none';
let ballX = 0.5;
let ballY = 0.5;

/** Un pas d'une seconde de jeu. `t` est l'instant mural, `matchMs` le chrono. */
function playSecond(t: number, matchMs: number): void {
  // La possession tourne. Le Real garde un peu plus le ballon.
  const keepProbability = possession === 'home' ? 0.93 : 0.91;
  if (!chance(keepProbability)) {
    possession = other(possession);
    if (intensity !== 'none') {
      intensity = 'none';
      push(t, 'attack', { side: null, intensity: 'none' });
    }
  }

  const attackingRight = possession === 'home';
  const target = attackingRight ? 0.78 : 0.22;

  // Montée d'intensité
  if (intensity === 'none' && chance(0.09)) {
    intensity = 'attack';
    push(t, 'attack', { side: possession, intensity: 'attack' });
  } else if (intensity === 'attack' && chance(0.12)) {
    intensity = 'dangerous';
    push(t, 'attack', { side: possession, intensity: 'dangerous' });
  } else if (intensity === 'dangerous' && chance(0.22)) {
    intensity = 'attack';
    push(t, 'attack', { side: possession, intensity: 'attack' });
  }

  // Le ballon dérive vers le but attaqué, avec du bruit.
  const pull = intensity === 'dangerous' ? 0.22 : intensity === 'attack' ? 0.12 : 0.05;
  ballX += (target - ballX) * pull + between(-0.05, 0.05);
  ballY += between(-0.09, 0.09);
  ballX = Math.min(0.97, Math.max(0.03, ballX));
  ballY = Math.min(0.95, Math.max(0.05, ballY));
  push(t, 'ball', { x: Number(ballX.toFixed(3)), y: Number(ballY.toFixed(3)) });

  // Faits de jeu issus des phases chaudes
  if (intensity === 'dangerous') {
    if (chance(0.07)) {
      const onTarget = chance(0.42);
      const xg = Number(between(0.03, onTarget ? 0.34 : 0.12).toFixed(3));
      stats.shots[idx(possession)] += 1;
      if (onTarget) stats.shotsOnTarget[idx(possession)] += 1;
      stats.xg[idx(possession)] = Number((stats.xg[idx(possession)] + xg).toFixed(3));
      push(t, 'shot', { side: possession, onTarget, xg });
      intensity = 'attack';
      push(t, 'attack', { side: possession, intensity: 'attack' });
    } else if (chance(0.045)) {
      stats.corners[idx(possession)] += 1;
      push(t, 'corner', { side: possession });
    }
  }

  if (chance(0.012)) {
    stats.fouls[idx(other(possession))] += 1;
    push(t, 'free_kick', { side: possession });
  }
  if (chance(0.004)) {
    stats.offsides[idx(possession)] += 1;
    push(t, 'offside', { side: possession });
  }

  stats.passes[idx(possession)] += chance(0.6) ? 1 : 0;

  // Possession : moyenne glissante vers la réalité des passes
  const totalPasses = stats.passes[0] + stats.passes[1];
  if (totalPasses > 0) {
    const realShare = (stats.passes[0] / totalPasses) * 100;
    stats.possession[0] += (realShare - stats.possession[0]) * 0.02;
    stats.possession[1] = 100 - stats.possession[0];
  }
}

/** Les temps forts scriptés qui tombent dans cette seconde. */
function fireScript(t: number, matchMs: number): void {
  for (const item of SCRIPT) {
    if (item.at < matchMs - 1000 || item.at >= matchMs) continue;

    if (item.kind === 'goal') {
      score[idx(item.side)] += 1;
      stats.shots[idx(item.side)] += 1;
      stats.shotsOnTarget[idx(item.side)] += 1;
      stats.xg[idx(item.side)] = Number(
        (stats.xg[idx(item.side)] + (item.penalty ? 0.76 : between(0.2, 0.6))).toFixed(3),
      );
      push(t, 'goal', {
        side: item.side,
        scorer: item.scorer,
        ...(item.assist ? { assist: item.assist } : {}),
        ...(item.penalty ? { penalty: true } : {}),
        score: [score[0], score[1]] as Pair,
      });
      // Après un but, le jeu repart du centre.
      ballX = 0.5;
      ballY = 0.5;
      intensity = 'none';
      possession = other(item.side);
      push(t, 'attack', { side: null, intensity: 'none' });
    } else if (item.kind === 'card') {
      push(t, 'card', { side: item.side, player: item.player, card: item.card });
    } else {
      push(t, 'substitution', { side: item.side, out: item.out, in: item.in });
    }
  }
}

function pushClock(
  t: number,
  matchMs: number,
  running: boolean,
  phase: MatchPhase,
  added?: number,
): void {
  push(t, 'clock', {
    matchMs: Math.round(matchMs),
    running,
    phase,
    ...(added !== undefined ? { addedMinutes: added } : {}),
  });
}

/** Les panneaux latéraux : multiplex, cotes, audience. */
function pushDeck(t: number, matchMs: number): void {
  push(t, 'other_matches', { matches: multiplexAt(matchMs) });
  push(t, 'odds', oddsAt([score[0], score[1]] as Pair, matchMs));
  push(t, 'audience', audienceAt());
}

function pushStats(t: number): void {
  push(t, 'stats', {
    possession: [Math.round(stats.possession[0]), Math.round(stats.possession[1])] as Pair,
    shots: [...stats.shots] as Pair,
    shotsOnTarget: [...stats.shotsOnTarget] as Pair,
    corners: [...stats.corners] as Pair,
    fouls: [...stats.fouls] as Pair,
    offsides: [...stats.offsides] as Pair,
    xg: [Number(stats.xg[0].toFixed(2)), Number(stats.xg[1].toFixed(2))] as Pair,
    passes: [...stats.passes] as Pair,
  });
}

// ─────────────────────────────── Le déroulement ───────────────────────────────

// Avant-match
push(-30 * MIN, 'meta', META);
push(-30 * MIN, 'phase', { phase: 'pre' });
pushClock(-30 * MIN, 0, false, 'pre');

const lineup = (side: Side, formation: string, starters: Player[], bench: Player[], coach: string): LineupPayload => ({
  side,
  formation,
  starters,
  bench,
  coach,
});

push(-25 * MIN, 'lineup', lineup('home', '4-3-3', HOME_XI, HOME_BENCH, 'Carlo Ancelotti'));
push(-25 * MIN, 'lineup', lineup('away', '4-3-3', AWAY_XI, AWAY_BENCH, 'Pep Guardiola'));
push(-20 * MIN, 'score', { score: [0, 0] });
push(-20 * MIN, 'standings', { rows: STANDINGS });
push(-20 * MIN, 'confrontation', CONFRONTATION);
push(-20 * MIN, 'other_matches', { matches: multiplexAt(-20 * MIN) });
push(-20 * MIN, 'odds', oddsAt([0, 0] as Pair, 0));
push(-20 * MIN, 'audience', audienceAt());

// Première période
push(0, 'phase', { phase: 'first_half' });
pushClock(0, 0, true, 'first_half');

const END_1 = 45 * MIN + STOPPAGE_1;
for (let ms = 1000; ms <= END_1; ms += 1000) {
  const t = ms;
  fireScript(t, ms);
  playSecond(t, ms);
  // Le fournisseur n'envoie un ancrage que toutes les 15 secondes. C'est
  // exactement ce qui faisait sauter les chronos mal construits.
  if (ms % 15_000 === 0) {
    const added = ms > 45 * MIN ? Math.ceil(STOPPAGE_1 / MIN) : undefined;
    pushClock(t, ms, true, 'first_half', added);
  }
  if (ms % 30_000 === 0) pushStats(t);
  if (ms % 20_000 === 0) pushDeck(t, ms);
}

// Mi-temps
push(END_1, 'phase', { phase: 'half_time' });
pushClock(END_1, 45 * MIN, false, 'half_time');
pushStats(END_1);

const SECOND_START = END_1 + HALF_TIME_BREAK;
push(SECOND_START, 'phase', { phase: 'second_half' });
pushClock(SECOND_START, 45 * MIN, true, 'second_half');

// Seconde période
possession = 'away';
intensity = 'none';
ballX = 0.5;
ballY = 0.5;

const END_2 = 90 * MIN + STOPPAGE_2;
for (let ms = 45 * MIN + 1000; ms <= END_2; ms += 1000) {
  const t = SECOND_START + (ms - 45 * MIN);
  fireScript(t, ms);
  playSecond(t, ms);
  if (ms % 15_000 === 0) {
    const added = ms > 90 * MIN ? Math.ceil(STOPPAGE_2 / MIN) : undefined;
    pushClock(t, ms, true, 'second_half', added);
  }
  if (ms % 30_000 === 0) pushStats(t);
  if (ms % 20_000 === 0) pushDeck(t, ms);
}

const FULL_TIME = SECOND_START + (END_2 - 45 * MIN);
push(FULL_TIME, 'phase', { phase: 'full_time' });
pushClock(FULL_TIME, END_2, false, 'full_time');
pushStats(FULL_TIME);
push(FULL_TIME, 'score', { score: [score[0], score[1]] as Pair });

// Notes des joueurs, en fin de match
for (const [side, xi] of [['home', HOME_XI], ['away', AWAY_XI]] as const) {
  const ratings: Record<string, number> = {};
  for (const p of xi) ratings[p.id] = Number(between(5.4, 8.9).toFixed(1));
  push(FULL_TIME + 30_000, 'rating', { side, ratings });
}

// ──────────────────────────────── Écriture ────────────────────────────────────

events.sort((a, b) => a.t - b.t || a.seq - b.seq);
events.forEach((e, i) => {
  (e as { seq: number }).seq = i;
});

const out = resolve(process.cwd(), 'fixtures/demo-ucl.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      $comment:
        'Match de démonstration. Les `t` sont en ms RELATIFS au coup d’envoi (negatifs avant). Le rejoueur les ramene en absolu.',
      meta: META,
      durationMs: FULL_TIME + 60_000,
      events,
    },
    null,
    0,
  ),
);

const kinds = events.reduce<Record<string, number>>((acc, e) => {
  acc[e.kind] = (acc[e.kind] ?? 0) + 1;
  return acc;
}, {});

console.log(`✓ fixtures/demo-ucl.json — ${events.length} événements`);
console.log(`  Score final : ${HOME.abbr} ${score[0]}-${score[1]} ${AWAY.abbr}`);
console.log(`  Répartition :`, kinds);
