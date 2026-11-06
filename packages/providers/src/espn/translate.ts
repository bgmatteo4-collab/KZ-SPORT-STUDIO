/**
 * La traduction ESPN → notre modèle.
 *
 * Fonction PURE : pas de `Date.now()`, pas d'entrée/sortie, pas de hasard. On
 * lui donne une réponse et un instant, elle rend des événements. C'est ce qui
 * permet de la rejouer cinquante fois contre un fichier capturé jusqu'à ce
 * qu'elle soit juste, sans toucher au réseau.
 *
 * ── Les trois invariants ────────────────────────────────────────────────────
 *
 * 1. IDEMPOTENCE. ESPN renvoie l'état COMPLET à chaque appel. Sans mémoire des
 *    faits déjà émis, le même but arriverait toutes les dix secondes.
 * 2. LE SCORE VIENT DU FOURNISSEUR. On n'additionne jamais les buts soi-même :
 *    un but annulé par l'arbitrage vidéo ferait dériver le plateau pour le
 *    reste du match.
 * 3. PAS DE DONNÉE, PAS D'ÉVÉNEMENT. Jamais d'erreur, jamais de valeur
 *    inventée. Ce qu'on n'a pas su lire part dans `etat.lacunes`, et l'outil
 *    de capture l'affiche.
 *
 * ── Ce qui est meilleur ici que chez Sportmonks ─────────────────────────────
 *
 * ESPN horodate ses faits en temps RÉEL (`wallclock`). Quand on se branche sur
 * un match déjà commencé, les minutes affichées sont donc exactes au lieu
 * d'être toutes ramenées à l'instant du branchement.
 */

import type {
  LineupPayload,
  MatchEvent,
  MatchPhase,
  MatchStats,
  OtherMatch,
  Odds,
  Pair,
  Player,
  Side,
  StandingRow,
  Team,
  TeamBrief,
} from '@kz/core';
import {
  LIGUES,
  logoDeLigue,
  maillotDeviné,
  type EspnLeague,
  type EspnBoxscoreTeam,
  type EspnCompetitor,
  type EspnDetail,
  type EspnEvent,
  type EspnKeyEvent,
  type EspnOdds,
  type EspnRoster,
  type EspnStandings,
  type EspnStatus,
  type EspnSummary,
  type EspnTeam,
} from './types.js';

/** Le gris des équipes dont on ne connaît pas les couleurs. Voir `classement`. */
const GRIS_INCONNU = '#55606e';

export interface EtatTraduction {
  seq: number;
  /** Les clés des faits déjà émis. C'est tout l'invariant d'idempotence. */
  emis: Set<string>;
  /** Identifiants ESPN des deux équipes, une fois tranchés. */
  domicile: string | null;
  exterieur: string | null;
  /** Instant réel du coup d'envoi, pour situer les faits qui n'ont pas de `wallclock`. */
  coupDEnvoi: number | null;
  /** Ce que la traduction n'a pas su lire. Vide, c'est bon signe. */
  lacunes: Set<string>;
  /** Couleurs et trigrammes glanés sur toutes les équipes croisées. */
  repertoire: Map<string, TeamBrief>;
  /** Signatures, pour ne pas réémettre un état identique. */
  vuMeta: string | null;
  vuPhase: MatchPhase | null;
  vuHorloge: string | null;
  vuScore: string | null;
  vuStats: string | null;
  vuCompo: { home: string | null; away: string | null };
  vuClassement: string | null;
  vuAutres: string | null;
  vuCotes: string | null;
}

export function nouvelEtat(): EtatTraduction {
  return {
    seq: 0,
    emis: new Set(),
    domicile: null,
    exterieur: null,
    coupDEnvoi: null,
    lacunes: new Set(),
    repertoire: new Map(),
    vuMeta: null,
    vuPhase: null,
    vuHorloge: null,
    vuScore: null,
    vuStats: null,
    vuCompo: { home: null, away: null },
    vuClassement: null,
    vuAutres: null,
    vuCotes: null,
  };
}

/** Ce qu'on donne à la traduction : les deux réponses, et la soirée autour. */
export interface SourceEspn {
  /** L'entrée du tableau de bord pour NOTRE match. */
  event?: EspnEvent;
  /** Le résumé détaillé du même match. Facultatif : il coûte cher à charger. */
  summary?: EspnSummary;
  /** Les autres rencontres de la soirée, pour le multiplex. */
  autres?: EspnEvent[];
  /** L'identifiant de championnat ESPN, pour nommer la compétition. */
  ligue?: string;
  /** Le bloc « leagues » du tableau de bord : il porte l'emblème officiel. */
  ligueInfos?: EspnLeague;
}

// ────────────────────────────────── Outils ──────────────────────────────────

function nombre(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function dernierMot(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : nom;
}

function trigramme(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length >= 3) return mots.slice(0, 3).map((m) => m[0]!).join('').toUpperCase();
  const base = (mots[0] ?? nom).replace(/[^A-Za-zÀ-ÿ]/g, '');
  return base.slice(0, 3).toUpperCase();
}

function couleur(hex?: string): string | null {
  if (!hex) return null;
  const h = hex.replace(/^#/, '').trim();
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h}` : null;
}

/** Le temps additionnel ne vit QUE dans `displayClock` : « 90'+4' ». */
export function tempsAdditionnel(displayClock?: string): number | null {
  const m = /\+\s*(\d+)/.exec(displayClock ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * La période, lue sur `state` et `period` plutôt que sur `type.name`.
 *
 * L'énumération complète des `STATUS_*` est inconnue — c'est une API non
 * documentée. `state` ne vaut que « pre », « in » ou « post », et `period`
 * tranche le reste. On ne dépend donc d'aucune liste qu'on ne maîtrise pas.
 */
export function phaseDepuisEtat(st?: EspnStatus): MatchPhase {
  const nom = (st?.type?.name ?? '').toUpperCase();
  if (nom.includes('HALFTIME') || nom.includes('HALF_TIME')) return 'half_time';
  if (nom.includes('PENALT') || nom.includes('SHOOTOUT')) return 'penalties';
  if (nom.includes('FULL_TIME') || nom.includes('FINAL') || nom.includes('FT')) return 'full_time';

  const etat = st?.type?.state;
  if (etat === 'pre') return 'pre';
  if (etat === 'post') return 'full_time';

  switch (st?.period ?? 1) {
    case 1:
      return 'first_half';
    case 2:
      return 'second_half';
    case 3:
      return 'extra_first';
    case 4:
      return 'extra_second';
    case 5:
      return 'penalties';
    default:
      return 'second_half';
  }
}

/** Le score, tel que le fournisseur le donne. Jamais une addition de buts. */
export function lireScore(competitors?: EspnCompetitor[]): Pair | null {
  let dom: number | null = null;
  let ext: number | null = null;
  for (const c of competitors ?? []) {
    const n = nombre(c.score);
    if (n === null) continue;
    if (c.homeAway === 'home') dom = n;
    else if (c.homeAway === 'away') ext = n;
  }
  return dom === null || ext === null ? null : [dom, ext];
}

function joueur(a?: {
  id?: string;
  displayName?: string;
  shortName?: string;
  fullName?: string;
  lastName?: string;
  jersey?: string;
  position?: string | { abbreviation?: string; name?: string };
}): Player | undefined {
  if (!a) return undefined;
  const nom = a.fullName ?? a.displayName ?? a.shortName;
  if (!nom) return undefined;
  const poste = typeof a.position === 'string' ? a.position : a.position?.abbreviation;
  return {
    id: a.id ?? nom,
    name: nom,
    // ESPN donne « A. Koita » ; à l'antenne on veut « Koita », plus lisible en
    // gros. Le nom de famille quand il est là, le dernier mot sinon.
    short: a.lastName ?? dernierMot(nom),
    number: nombre(a.jersey) ?? 0,
    ...(poste ? { position: poste } : {}),
  };
}

function equipe(t: EspnTeam | undefined, uniforme?: { color?: string; alternateColor?: string }): Team | null {
  if (!t) return null;
  const nom = t.displayName ?? t.name ?? t.shortDisplayName;
  if (!nom) return null;
  const court = t.shortDisplayName ?? t.name ?? nom;
  const kit = maillotDeviné(nom);
  // Les couleurs du maillot porté ce jour-là passent devant celles du club :
  // c'est ce que le spectateur a sous les yeux.
  const principale = couleur(uniforme?.color) ?? couleur(t.color) ?? GRIS_INCONNU;
  const seconde = couleur(uniforme?.alternateColor) ?? couleur(t.alternateColor);
  // Le vrai écusson, servi par ESPN. On ne le RANGE pas dans le dépôt : on
  // garde l'adresse, qui vient de la donnée en direct. Et l'écu dessiné reste
  // dessous, donc une image qui ne charge pas ne laisse jamais de trou.
  const logo = t.logo ?? t.logos?.find((l) => l.href)?.href;
  return {
    id: t.id ?? nom,
    name: nom,
    short: court,
    abbr: t.abbreviation ?? trigramme(court),
    color: principale,
    ...(seconde ? { colorAlt: seconde } : {}),
    ...(kit ? { kit } : {}),
    ...(logo ? { crest: logo } : {}),
  };
}

function bref(t: Team): TeamBrief {
  return {
    abbr: t.abbr,
    short: t.short,
    color: t.color,
    ...(t.colorAlt ? { colorAlt: t.colorAlt } : {}),
    ...(t.kit ? { kit: t.kit } : {}),
    ...(t.crest ? { crest: t.crest } : {}),
  };
}

/**
 * Le score APRÈS un but, lu dans le texte rédigé par ESPN.
 *
 * « Goal! AEK Athens 1, Real Madrid 0. » — le fournisseur nous donne lui-même
 * le score à cet instant, ce qui respecte l'invariant n°2 même quand on
 * rattrape plusieurs buts d'un coup au premier appel.
 */
export function scoreDansLeTexte(texte: string, nomDom: string, nomExt: string): Pair | null {
  const ech = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`${ech(nomDom)}\\s+(\\d+),\\s*${ech(nomExt)}\\s+(\\d+)`).exec(texte);
  if (direct) return [Number(direct[1]), Number(direct[2])];
  const inverse = new RegExp(`${ech(nomExt)}\\s+(\\d+),\\s*${ech(nomDom)}\\s+(\\d+)`).exec(texte);
  if (inverse) return [Number(inverse[2]), Number(inverse[1])];
  return null;
}

/** Cote américaine → cote décimale. -550 vaut 1.18 ; +250 vaut 3.50. */
export function americainVersDecimal(m: number): number | null {
  if (!Number.isFinite(m) || m === 0) return null;
  return Math.round((m > 0 ? m / 100 + 1 : 100 / -m + 1) * 100) / 100;
}

/**
 * Les statistiques, avec leurs unités remises d'aplomb.
 *
 * ESPN mélange pourcentages et ratios dans le même tableau : `possessionPct`
 * vaut 30.4 mais `passPct` vaut 0.9. Afficher l'un pour l'autre donnerait
 * « 0,9 % de passes réussies » à l'antenne, et personne ne le remarquerait
 * avant le direct.
 */
export function statistiques(
  teams: EspnBoxscoreTeam[] | undefined,
  etat: EtatTraduction,
): Partial<MatchStats> | null {
  if (!teams || teams.length === 0) return null;

  const parCamp: Record<Side, Map<string, number>> = { home: new Map(), away: new Map() };
  let trouve = false;

  for (const t of teams) {
    const camp: Side | null =
      t.homeAway === 'home' || t.team?.id === etat.domicile
        ? 'home'
        : t.homeAway === 'away' || t.team?.id === etat.exterieur
          ? 'away'
          : null;
    if (!camp) continue;
    for (const s of t.statistics ?? []) {
      const nom = s.name;
      const v = nombre(s.value) ?? nombre(s.displayValue);
      if (!nom || v === null) continue;
      parCamp[camp].set(nom, v);
      trouve = true;
    }
  }
  if (!trouve) return null;

  const paire = (nom: string, facteur = 1): Pair | null => {
    const d = parCamp.home.get(nom);
    const e = parCamp.away.get(nom);
    if (d === undefined || e === undefined) return null;
    return [Math.round(d * facteur * 10) / 10, Math.round(e * facteur * 10) / 10];
  };

  const out: Partial<MatchStats> = {};
  const poser = (cle: keyof MatchStats, v: Pair | null): void => {
    if (v) out[cle] = v;
  };

  poser('possession', paire('possessionPct')); // déjà en pourcentage
  poser('shots', paire('totalShots'));
  poser('shotsOnTarget', paire('shotsOnTarget'));
  poser('corners', paire('wonCorners'));
  poser('fouls', paire('foulsCommitted'));
  poser('offsides', paire('offsides'));
  poser('passes', paire('totalPasses'));
  poser('passAccuracy', paire('passPct', 100)); // ratio → pourcentage
  poser('yellowCards', paire('yellowCards'));
  poser('redCards', paire('redCards'));

  // ESPN ne publie pas d'`xG`. On ne le fabrique pas : une colonne vide est
  // honnête, une colonne inventée est un mensonge à l'antenne.
  if (!parCamp.home.has('expectedGoals')) etat.lacunes.add('xG absent (ESPN ne le publie pas)');

  return Object.keys(out).length > 0 ? out : null;
}

function compo(r: EspnRoster, camp: Side): LineupPayload | null {
  const lignes = r.roster ?? [];
  if (lignes.length === 0) return null;

  const place = (e: { formationPlace?: string }): number => nombre(e.formationPlace) ?? 999;
  const titulaires = lignes
    .filter((e) => e.starter)
    .sort((a, b) => place(a) - place(b))
    .map((e) => joueur({ ...e.athlete, jersey: e.jersey ?? e.athlete?.jersey, position: e.position }))
    .filter((p): p is Player => p !== undefined);
  const banc = lignes
    .filter((e) => !e.starter)
    .map((e) => joueur({ ...e.athlete, jersey: e.jersey ?? e.athlete?.jersey, position: e.position }))
    .filter((p): p is Player => p !== undefined);

  if (titulaires.length === 0) return null;
  return {
    side: camp,
    // ESPN calcule la formation lui-même. On ne la déduit pas des lignes, donc
    // on ne peut pas se tromper dessus.
    formation: r.formation ?? '',
    starters: titulaires,
    bench: banc,
    // ESPN ne donne pas l'entraîneur dans ce bloc.
  };
}

function classement(st: EspnStandings | undefined, etat: EtatTraduction): StandingRow[] | null {
  const groupes = st?.groups ?? [];
  const entrees = groupes.flatMap((g) => g.standings?.entries ?? []);
  if (entrees.length === 0) return null;

  let inconnues = 0;
  const lignes: StandingRow[] = [];

  for (const e of entrees) {
    const nom = e.team;
    if (!nom) continue;
    const stat = (n: string): number | null => {
      for (const s of e.stats ?? []) if (s.name === n) return nombre(s.value) ?? nombre(s.displayValue);
      return null;
    };
    // Le classement d'ESPN ne porte PAS les couleurs : il donne un nom et un
    // identifiant. On réutilise ce qu'on a glané sur les équipes croisées dans
    // la soirée, et le reste reste gris — un gris franc, le même pour toutes,
    // plutôt que des couleurs plausibles et fausses.
    const connue = e.id ? etat.repertoire.get(e.id) : undefined;
    if (!connue) inconnues += 1;
    // Le classement, lui, porte son propre logo : même une équipe qu'on n'a
    // pas croisée ce soir aura donc son vrai écusson.
    const embleme = e.logo?.find((l) => l.href)?.href;
    const base: TeamBrief = connue ?? { abbr: trigramme(nom), short: nom, color: GRIS_INCONNU };
    lignes.push({
      rank: stat('rank') ?? lignes.length + 1,
      team: embleme && !base.crest ? { ...base, crest: embleme } : base,
      played: stat('gamesPlayed') ?? 0,
      diff: stat('pointDifferential') ?? 0,
      points: stat('points') ?? 0,
      zone: null,
    });
  }

  if (lignes.length === 0) return null;
  lignes.sort((a, b) => a.rank - b.rank);
  if (inconnues > 0) {
    etat.lacunes.add(`couleurs inconnues pour ${inconnues} équipe(s) du classement`);
  }
  return lignes;
}

function cotes(liste: EspnOdds[] | undefined): Odds | null {
  const o = liste?.[0];
  if (!o) return null;
  const dom = o.homeTeamOdds?.moneyLine;
  const ext = o.awayTeamOdds?.moneyLine;
  const nul = o.drawOdds?.moneyLine ?? o.drawOdds?.value;
  if (dom === undefined || ext === undefined || nul === undefined) return null;
  const d = americainVersDecimal(dom);
  const e = americainVersDecimal(ext);
  const n = americainVersDecimal(nul);
  if (d === null || e === null || n === null) return null;
  return { home: d, draw: n, away: e, ...(o.provider?.name ? { bookmaker: o.provider.name } : {}) };
}

/** La minute d'antenne d'un autre match : « 69 », « 45+2 », « MT », « FT ». */
export function minuteAffichee(st?: EspnStatus): string {
  const phase = phaseDepuisEtat(st);
  if (phase === 'half_time') return 'MT';
  if (phase === 'full_time') return 'FT';
  if (phase === 'pre') return '—';
  const brut = (st?.displayClock ?? '').replace(/'/g, '').trim();
  if (brut) return brut;
  const sec = nombre(st?.clock);
  return sec === null ? '—' : String(Math.floor(sec / 60));
}

/**
 * La clé d'idempotence d'un fait.
 *
 * Elle doit être SÉMANTIQUE, et surtout pas liée à la source. Le même but nous
 * arrive deux fois : une fois dans le résumé, qui lui donne un identifiant
 * stable, et une fois dans le tableau de bord, qui n'en donne aucun. Une clé
 * par source le laisse passer deux fois — et à l'antenne, c'est le but affiché
 * en double.
 *
 * Ce qui identifie vraiment un fait de football : sa nature, l'équipe, le
 * joueur, et la minute. Deux buts du même joueur pour la même équipe dans la
 * même minute, ça n'existe pas.
 */
export function cleDuFait(
  f: EspnDetail | EspnKeyEvent,
  classe: string,
  qui?: Player,
): string {
  const sec = nombre(f.clock?.value);
  const minute = sec !== null ? String(Math.floor(sec / 60)) : (f.clock?.displayValue ?? '?');
  return `${classe}|${f.team?.id ?? '?'}|${qui?.id ?? '?'}|${minute}`;
}

// ──────────────────────────────── La traduction ──────────────────────────────

export function traduire(src: SourceEspn, now: number, etat: EtatTraduction): MatchEvent[] {
  const out: MatchEvent[] = [];
  const emettre = <K extends MatchEvent['kind']>(
    kind: K,
    t: number,
    payload: Extract<MatchEvent, { kind: K }>['payload'],
  ): void => {
    out.push({ seq: etat.seq++, t, kind, payload } as MatchEvent);
  };

  const ev = src.event;
  const comp = ev?.competitions?.[0];
  const statut = ev?.status ?? comp?.status;

  // ── Les équipes, et de quel côté elles jouent ─────────────────────────────
  const dom = (comp?.competitors ?? []).find((c) => c.homeAway === 'home');
  const ext = (comp?.competitors ?? []).find((c) => c.homeAway === 'away');
  const uniformes = new Map<string, { color?: string; alternateColor?: string }>();
  for (const r of src.summary?.rosters ?? []) {
    if (r.team?.id && r.uniform) uniformes.set(r.team.id, r.uniform);
  }

  const eqDom = equipe(dom?.team, dom?.team?.id ? uniformes.get(dom.team.id) : undefined);
  const eqExt = equipe(ext?.team, ext?.team?.id ? uniformes.get(ext.team.id) : undefined);

  if (dom?.team?.id) etat.domicile = dom.team.id;
  if (ext?.team?.id) etat.exterieur = ext.team.id;
  if (!dom || !ext) {
    // `homeAway` est la seule source de vérité sur le côté. Sans lui on
    // n'invente pas : un plateau qui inverse les équipes est pire qu'un
    // plateau vide.
    if (ev) etat.lacunes.add('« homeAway » absent : impossible de trancher domicile/extérieur');
  }

  // On enrichit le répertoire avec TOUTES les équipes croisées — celles de la
  // soirée servent à colorer le classement.
  const noter = (t?: EspnTeam): void => {
    const e = equipe(t);
    if (e && t?.id) etat.repertoire.set(t.id, bref(e));
  };
  noter(dom?.team);
  noter(ext?.team);
  for (const a of src.autres ?? []) {
    for (const c of a.competitions?.[0]?.competitors ?? []) noter(c.team);
  }

  // ── Le coup d'envoi réel, qui sert à situer les faits sans `wallclock` ────
  for (const k of src.summary?.keyEvents ?? []) {
    if ((k.type?.type === 'kickoff' || k.type?.id === '80') && k.wallclock) {
      const t = Date.parse(k.wallclock);
      if (Number.isFinite(t)) etat.coupDEnvoi = t;
    }
  }
  if (etat.coupDEnvoi === null && ev?.date) {
    const t = Date.parse(ev.date);
    if (Number.isFinite(t)) etat.coupDEnvoi = t;
  }

  /** L'instant réel d'un fait : le `wallclock` d'ESPN, sinon le chrono. */
  const quand = (f: EspnDetail | EspnKeyEvent): number => {
    if ('wallclock' in f && f.wallclock) {
      const t = Date.parse(f.wallclock);
      if (Number.isFinite(t)) return t;
    }
    const sec = nombre(f.clock?.value);
    if (sec !== null && etat.coupDEnvoi !== null) return etat.coupDEnvoi + sec * 1000;
    return now;
  };

  /**
   * Ancrer l'horloge SUR un fait du passé.
   *
   * Sans ça, un but rattrapé au branchement s'affiche « 1' ». La raison est
   * subtile et m'a sauté aux yeux sur une capture d'écran : nos événements
   * sont triés par instant RÉEL, donc un but d'il y a deux heures est réduit
   * AVANT l'ancre d'horloge du présent. Le réducteur calcule alors sa minute
   * sur une horloge encore à zéro.
   *
   * ESPN donne le chrono de chaque fait. On pose donc, juste avant lui et au
   * même instant, une ancre qui dit « à cet instant, le match en était là ».
   * `running: false` volontairement : entre deux faits, figer est exact, alors
   * qu'extrapoler traverserait les mi-temps et les arrêts de jeu.
   */
  const ancrerSurLeFait = (f: EspnDetail | EspnKeyEvent, t: number): void => {
    // Un fait récent n'en a pas besoin : l'ancre du tour courant le couvre.
    if (now - t < 120_000) return;
    const sec = nombre(f.clock?.value);
    if (sec === null) return;
    const periode = 'period' in f ? nombre(f.period?.number) : null;
    const ph: MatchPhase =
      periode === 1
        ? 'first_half'
        : periode === 2
          ? 'second_half'
          : periode === 3
            ? 'extra_first'
            : periode === 4
              ? 'extra_second'
              : periode === 5
                ? 'penalties'
                : sec >= 45 * 60
                  ? 'second_half'
                  : 'first_half';
    // Le chrono d'ESPN plafonne à la fin réglementaire : un but à la 90e+2 a
    // `clock.value` 5400 et le « +2 » dans l'affichage seulement.
    const ajout = tempsAdditionnel(f.clock?.displayValue);
    emettre('clock', t, {
      matchMs: sec * 1000,
      running: false,
      phase: ph,
      ...(ajout !== null ? { addedMinutes: ajout } : {}),
    });
  };

  const coteDe = (id?: string): Side | null =>
    id && id === etat.domicile ? 'home' : id && id === etat.exterieur ? 'away' : null;

  // ── meta ──────────────────────────────────────────────────────────────────
  if (eqDom && eqExt) {
    const ligue = src.ligue ? LIGUES[src.ligue] : undefined;
    const embleme = logoDeLigue(src.ligueInfos);
    const meta = {
      id: ev?.id ?? `${eqDom.id}-${eqExt.id}`,
      competition: ligue?.nom ?? src.ligueInfos?.name ?? src.ligue ?? 'Football',
      competitionTheme: ligue?.theme ?? 'kztv',
      ...(embleme ? { competitionCrest: embleme } : {}),
      home: eqDom,
      away: eqExt,
      kickoff: etat.coupDEnvoi ?? now,
      ...(comp?.notes?.[0]?.headline ? { round: comp.notes[0].headline } : {}),
      ...(ev?.venue?.fullName ?? comp?.venue?.fullName
        ? { venue: (ev?.venue?.fullName ?? comp?.venue?.fullName)! }
        : {}),
    };
    const signature = JSON.stringify(meta);
    if (signature !== etat.vuMeta) {
      etat.vuMeta = signature;
      emettre('meta', now, meta);
    }
  }

  // ── phase et horloge ──────────────────────────────────────────────────────
  if (statut) {
    const phase = phaseDepuisEtat(statut);
    if (phase !== etat.vuPhase) {
      etat.vuPhase = phase;
      emettre('phase', now, { phase });
    }

    const sec = nombre(statut.clock);
    if (sec !== null) {
      const ajout = tempsAdditionnel(statut.displayClock);
      const tourne = statut.type?.state === 'in' && phase !== 'half_time';
      const ancre = {
        matchMs: sec * 1000,
        running: tourne,
        phase,
        ...(ajout !== null ? { addedMinutes: ajout } : {}),
      };
      const signature = JSON.stringify(ancre);
      if (signature !== etat.vuHorloge) {
        etat.vuHorloge = signature;
        emettre('clock', now, ancre);
      }
    } else if (statut.type?.state === 'in') {
      etat.lacunes.add('match en cours mais « clock » absent');
    }
  }

  // ── score ─────────────────────────────────────────────────────────────────
  const score = lireScore(comp?.competitors);
  if (score) {
    const signature = `${score[0]}-${score[1]}`;
    if (signature !== etat.vuScore) {
      etat.vuScore = signature;
      emettre('score', now, { score });
    }
  }

  // ── les faits ─────────────────────────────────────────────────────────────
  // On préfère les `keyEvents` du résumé : identifiant stable, nom du buteur,
  // texte rédigé, instant réel. Les `details` du tableau de bord servent de
  // filet quand le résumé n'a pas été chargé à ce tour.
  const faits: (EspnDetail | EspnKeyEvent)[] = [
    ...(src.summary?.keyEvents ?? []),
    ...(comp?.details ?? []),
  ];

  for (const f of faits) {
    const slug = f.type?.type ?? '';
    const texte = ('text' in f ? f.text : undefined) ?? '';
    const libelle = (f.type?.text ?? '').toLowerCase();
    const camp = coteDe(f.team?.id);
    const t = quand(f);

    const athletes: Player[] = (
      'athletesInvolved' in f
        ? (f.athletesInvolved ?? []).map((a) => joueur(a))
        : (('participants' in f ? f.participants : undefined) ?? []).map((p) => joueur(p.athlete))
    ).filter((p): p is Player => p !== undefined);

    // On classe AVANT de dédoublonner : c'est la nature du fait qui fait sa
    // clé. Et la nature se lit sur les DRAPEAUX, pas sur `type.id` — six
    // identifiants différents désignent déjà un but, et rien n'interdit un
    // septième demain.
    const estBut = f.scoringPlay === true || slug === 'goal' || /goal/.test(libelle);
    const csc = ('ownGoal' in f ? f.ownGoal : undefined) === true || /own goal/.test(libelle);
    const penalty = ('penaltyKick' in f ? f.penaltyKick : undefined) === true || /penalty/.test(libelle);
    const rouge = ('redCard' in f ? f.redCard : undefined) === true || slug === 'red-card';
    const jaune = ('yellowCard' in f ? f.yellowCard : undefined) === true || slug === 'yellow-card';
    const estRemplacement = slug === 'substitution' || /substitution/.test(libelle);
    // Coups d'envoi, mi-temps, arrêts de jeu : la phase et l'horloge les
    // portent déjà, on ne les traduit pas en faits.
    const estChrono = /kickoff|halftime|start-|end-|delay/.test(slug);

    const classe = estBut
      ? 'but'
      : rouge
        ? 'rouge'
        : jaune
          ? 'jaune'
          : estRemplacement
            ? 'remplacement'
            : // Pour ce qu'on n'émet pas, on garde le libellé dans la clé :
              // sinon deux types différents à la même minute se confondraient
              // et masqueraient une lacune.
              `${estChrono ? 'chrono' : 'inconnu'}:${slug || libelle}`;

    const cle = cleDuFait(f, classe, athletes[0]);
    if (etat.emis.has(cle)) continue;
    etat.emis.add(cle);

    if (estBut && camp) {
      // Le score au moment du but : d'abord celui qu'ESPN écrit dans son
      // propre texte, sinon le score courant. Jamais une addition.
      const dansTexte =
        texte && eqDom && eqExt ? scoreDansLeTexte(texte, eqDom.name, eqExt.name) : null;
      const apres = dansTexte ?? score;
      if (!dansTexte && score) etat.lacunes.add('score d’un but repris du score courant');
      if (!apres) {
        // Sans score, on ne peut pas afficher le but. On oublie la clé pour
        // pouvoir le reprendre au tour suivant plutôt que de le perdre.
        etat.emis.delete(cle);
        continue;
      }
      ancrerSurLeFait(f, t);
      emettre('goal', t, {
        side: camp,
        score: apres,
        ...(athletes[0] ? { scorer: athletes[0] } : {}),
        ...(athletes[1] ? { assist: athletes[1] } : {}),
        ...(csc ? { ownGoal: true } : {}),
        ...(penalty ? { penalty: true } : {}),
      });
      continue;
    }

    // ── un carton ───────────────────────────────────────────────────────────
    if ((rouge || jaune) && camp) {
      ancrerSurLeFait(f, t);
      emettre('card', t, {
        side: camp,
        card: rouge ? 'red' : 'yellow',
        ...(athletes[0] ? { player: athletes[0] } : {}),
      });
      continue;
    }

    // ── un remplacement ─────────────────────────────────────────────────────
    if (estRemplacement) {
      if (!camp) continue;
      ancrerSurLeFait(f, t);
      emettre('substitution', t, {
        side: camp,
        ...(athletes[0] ? { in: athletes[0] } : {}),
        ...(athletes[1] ? { out: athletes[1] } : {}),
      });
      continue;
    }

    if (estChrono) continue;

    // Un type qu'on ne connaît pas. On ne devine pas, on le signale.
    if (slug || libelle) etat.lacunes.add(`type de fait non traduit : ${slug || libelle}`);
  }

  // ── statistiques ──────────────────────────────────────────────────────────
  const stats = statistiques(src.summary?.boxscore?.teams, etat);
  if (stats) {
    const signature = JSON.stringify(stats);
    if (signature !== etat.vuStats) {
      etat.vuStats = signature;
      emettre('stats', now, stats);
    }
  }

  // ── compositions ──────────────────────────────────────────────────────────
  for (const r of src.summary?.rosters ?? []) {
    const camp: Side | null =
      r.homeAway === 'home' || r.team?.id === etat.domicile
        ? 'home'
        : r.homeAway === 'away' || r.team?.id === etat.exterieur
          ? 'away'
          : null;
    if (!camp) continue;
    const c = compo(r, camp);
    if (!c) continue;
    if (!c.formation) etat.lacunes.add('formation absente du résumé');
    const signature = JSON.stringify(c);
    if (signature !== etat.vuCompo[camp]) {
      etat.vuCompo[camp] = signature;
      emettre('lineup', now, c);
    }
  }

  // ── classement ────────────────────────────────────────────────────────────
  const rangs = classement(src.summary?.standings, etat);
  if (rangs) {
    const signature = JSON.stringify(rangs);
    if (signature !== etat.vuClassement) {
      etat.vuClassement = signature;
      emettre('standings', now, { rows: rangs });
    }
  }

  // ── les autres matchs ─────────────────────────────────────────────────────
  if (src.autres && src.autres.length > 0) {
    const matches: OtherMatch[] = [];
    for (const a of src.autres) {
      const c = a.competitions?.[0];
      const d = (c?.competitors ?? []).find((x) => x.homeAway === 'home');
      const e = (c?.competitors ?? []).find((x) => x.homeAway === 'away');
      const ed = equipe(d?.team);
      const ee = equipe(e?.team);
      const sc = lireScore(c?.competitors);
      if (!ed || !ee || !sc) continue;
      const st = a.status ?? c?.status;
      matches.push({
        id: a.id ?? `${ed.id}-${ee.id}`,
        minute: minuteAffichee(st),
        live: st?.type?.state === 'in',
        home: bref(ed),
        away: bref(ee),
        score: sc,
      });
    }
    if (matches.length > 0) {
      const signature = JSON.stringify(matches);
      if (signature !== etat.vuAutres) {
        etat.vuAutres = signature;
        emettre('other_matches', now, { matches });
      }
    }
  }

  // ── cotes ─────────────────────────────────────────────────────────────────
  const c1n2 = cotes(src.summary?.odds ?? comp?.odds);
  if (c1n2) {
    const signature = JSON.stringify(c1n2);
    if (signature !== etat.vuCotes) {
      etat.vuCotes = signature;
      emettre('odds', now, c1n2);
    }
  }

  // ESPN ne donne aucune position de ballon. Le radar n'a donc pas de source
  // ici — il attend un palier payant ailleurs, ou se transforme en carte de
  // pression dérivée du fil du match.
  if (src.summary) etat.lacunes.add('position du ballon absente (ESPN n’en publie pas)');

  out.sort((a, b) => a.t - b.t || a.seq - b.seq);
  return out;
}
