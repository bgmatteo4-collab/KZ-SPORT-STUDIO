/**
 * La forme RÉELLE des réponses ESPN.
 *
 * ── Pourquoi ce fichier n'est pas écrit d'après une documentation ────────────
 *
 * Il n'y en a pas. L'API d'ESPN n'est pas documentée : elle alimente leur site
 * et leurs applications, et elle est publique sans jeton. Tout ce qui suit a
 * donc été relevé sur de vraies réponses — une soirée de Ligue des Champions
 * (9 matchs) et le résumé complet d'une rencontre. Les champs sont tous
 * optionnels, parce qu'une API non contractuelle peut en retirer un sans
 * prévenir et que notre règle est « pas de donnée, pas d'événement, jamais
 * d'erreur ».
 *
 * ── Les deux points d'entrée ────────────────────────────────────────────────
 *
 *   /scoreboard              toute la soirée. Léger (~15 Ko pour un
 *                            championnat). Donne score, horloge, période,
 *                            état, et les faits marquants bruts.
 *   /summary?event=<id>      une rencontre. Lourd (~475 Ko). Donne les
 *                            statistiques, les compositions, les faits
 *                            détaillés avec noms de joueurs, le classement,
 *                            les cotes et le fil du match.
 *
 * On interroge le premier souvent et le second plus rarement : voir la note
 * sur les cadences dans `index.ts`.
 *
 * ── Ce qu'ESPN ne donne PAS ─────────────────────────────────────────────────
 *
 * Aucune position de ballon, et aucun `xG`. Le radar et la colonne `xg` de nos
 * statistiques restent donc sans source. On ne les invente pas : la traduction
 * les laisse vides et l'inscrit dans ses lacunes.
 */

import type { Kit } from '@kz/core';

// ───────────────────────────── Le tableau de bord ────────────────────────────

export interface EspnScoreboard {
  events?: EspnEvent[];
  leagues?: EspnLeague[];
  day?: { date?: string };
}

export interface EspnLeague {
  id?: string;
  slug?: string;
  name?: string;
  abbreviation?: string;
  midsizeName?: string;
  /**
   * Deux variantes, distinguées par `rel` : « default » est l'emblème dessiné
   * pour un fond CLAIR, « dark » celui dessiné pour un fond sombre. Notre
   * cartouche de compétition est doré, donc c'est « default » qu'il faut — se
   * tromper de variante donne un logo blanc sur or, illisible.
   */
  logos?: { href?: string; rel?: string[] }[];
}

/** L'emblème de la compétition, dans la variante qui va sur notre cartouche doré. */
export function logoDeLigue(l: EspnLeague | undefined): string | undefined {
  const liste = l?.logos ?? [];
  const clair = liste.find((x) => (x.rel ?? []).includes('default') && !(x.rel ?? []).includes('dark'));
  return clair?.href ?? liste[0]?.href;
}

export interface EspnEvent {
  id?: string;
  /** Coup d'envoi PRÉVU, en ISO 8601 : « 2026-11-04T17:45Z ». */
  date?: string;
  /** « Real Madrid at AEK Athens » — le domicile est à DROITE du « at ». */
  name?: string;
  shortName?: string;
  status?: EspnStatus;
  venue?: { fullName?: string; displayName?: string };
  competitions?: EspnCompetition[];
}

export interface EspnStatus {
  /** Chrono du match en SECONDES. Plafonne à la fin réglementaire : 5400 = 90'. */
  clock?: number;
  /** « 90'+4' » — c'est là, et nulle part ailleurs, que vit le temps additionnel. */
  displayClock?: string;
  /** 1 première période, 2 seconde, 3 et 4 prolongations, 5 tirs au but. */
  period?: number;
  type?: {
    id?: string;
    /** « STATUS_FULL_TIME », « STATUS_HALFTIME »… l'énumération complète est inconnue. */
    name?: string;
    /** « pre » | « in » | « post ». Plus fiable que `name`, et suffisant. */
    state?: string;
    completed?: boolean;
    description?: string;
    /** « FT », « HT », ou l'heure de coup d'envoi quand le match n'a pas commencé. */
    detail?: string;
    shortDetail?: string;
  };
}

export interface EspnCompetition {
  id?: string;
  date?: string;
  startDate?: string;
  attendance?: number;
  status?: EspnStatus;
  venue?: { fullName?: string; displayName?: string };
  competitors?: EspnCompetitor[];
  /**
   * Les faits marquants, version légère. ATTENTION : ces entrées n'ont PAS
   * d'identifiant. L'idempotence doit donc se fabriquer une clé — voir
   * `cleDuFait` dans `translate.ts`.
   */
  details?: EspnDetail[];
  odds?: EspnOdds[];
  notes?: { type?: string; headline?: string }[];
  playByPlayAvailable?: boolean;
}

export interface EspnCompetitor {
  id?: string;
  homeAway?: string;
  /** Une CHAÎNE : « 2 ». Autoritaire — on ne compte jamais les buts soi-même. */
  score?: string;
  team?: EspnTeam;
}

export interface EspnTeam {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  location?: string;
  abbreviation?: string;
  /** Hexadécimal SANS dièse : « ffff00 ». */
  color?: string;
  alternateColor?: string;
  logo?: string;
  logos?: { href?: string; rel?: string[] }[];
}

/**
 * Un fait, version tableau de bord.
 *
 * On ne pilote PAS la traduction sur `type.id` : les buts arrivent sous au
 * moins six identifiants (70 but, 97 csc, 98 penalty, 137 de la tête, 138 sur
 * coup franc, 173 en reprise de volée), et rien n'empêche ESPN d'en ajouter un
 * demain. Les DRAPEAUX, eux, sont stables et exhaustifs.
 */
export interface EspnDetail {
  type?: { id?: string; text?: string; type?: string };
  clock?: { value?: number; displayValue?: string };
  team?: { id?: string };
  scoreValue?: number;
  scoringPlay?: boolean;
  redCard?: boolean;
  yellowCard?: boolean;
  penaltyKick?: boolean;
  ownGoal?: boolean;
  shootout?: boolean;
  athletesInvolved?: EspnAthlete[];
}

export interface EspnAthlete {
  id?: string;
  displayName?: string;
  /** « A. Koita » — exactement notre nom d'antenne, déjà abrégé par ESPN. */
  shortName?: string;
  fullName?: string;
  lastName?: string;
  jersey?: string;
  position?: string | { abbreviation?: string; name?: string };
  team?: { id?: string };
}

// ──────────────────────────────── Le résumé ─────────────────────────────────

export interface EspnSummary {
  boxscore?: { teams?: EspnBoxscoreTeam[] };
  rosters?: EspnRoster[];
  /**
   * Les faits, version riche : identifiant STABLE, texte rédigé, participants,
   * et surtout `wallclock` — l'instant réel du fait. C'est ce champ qui permet
   * de rattraper un match déjà commencé avec les bonnes minutes.
   */
  keyEvents?: EspnKeyEvent[];
  commentary?: { sequence?: number; time?: { value?: number; displayValue?: string }; text?: string }[];
  standings?: EspnStandings;
  odds?: EspnOdds[];
  header?: unknown;
  gameInfo?: { venue?: { fullName?: string }; attendance?: number };
}

export interface EspnBoxscoreTeam {
  team?: EspnTeam;
  homeAway?: string;
  /**
   * 28 entrées relevées. ATTENTION aux unités, qui ne sont pas homogènes :
   * `possessionPct` vaut 30.4 (un pourcentage) mais `passPct` vaut 0.9 (un
   * ratio). Afficher l'un pour l'autre donne « 0,9 % de passes réussies » à
   * l'antenne. La conversion est explicite dans `translate.ts`.
   */
  statistics?: { name?: string; displayValue?: string; value?: number; label?: string }[];
}

export interface EspnRoster {
  homeAway?: string;
  /** Déjà calculée par ESPN : « 4-4-2 ». On n'a pas à la déduire. */
  formation?: string;
  team?: EspnTeam;
  /** Les couleurs du maillot PORTÉ ce jour-là, souvent plus juste que `team.color`. */
  uniform?: { type?: string; color?: string; alternateColor?: string };
  roster?: EspnRosterEntry[];
}

export interface EspnRosterEntry {
  active?: boolean;
  starter?: boolean;
  jersey?: string;
  formationPlace?: string;
  position?: { abbreviation?: string; name?: string; displayName?: string };
  athlete?: EspnAthlete;
  subbedIn?: boolean | { didSub?: boolean; clock?: { displayValue?: string } };
  subbedOut?: boolean | { didSub?: boolean; clock?: { displayValue?: string } };
  subbedInFor?: EspnAthlete;
}

export interface EspnKeyEvent {
  /** Stable. C'est la clé d'idempotence qu'on préfère toujours. */
  id?: string;
  type?: { id?: string; text?: string; type?: string };
  /** Le texte rédigé contient le score APRÈS le but : « Goal! AEK Athens 1, Real Madrid 0. » */
  text?: string;
  shortText?: string;
  period?: { number?: number };
  clock?: { value?: number; displayValue?: string };
  scoringPlay?: boolean;
  team?: { id?: string; displayName?: string };
  participants?: { athlete?: EspnAthlete; type?: { text?: string } }[];
  /** Instant RÉEL du fait, en ISO 8601. Absent sur certains types. */
  wallclock?: string;
  shootout?: boolean;
}

export interface EspnStandings {
  groups?: {
    header?: string;
    standings?: { entries?: EspnStandingEntry[] };
  }[];
}

export interface EspnStandingEntry {
  /** Le NOM complet, pas un objet équipe : « Paris Saint-Germain ». */
  team?: string;
  id?: string;
  logo?: { href?: string }[];
  /** `gamesPlayed`, `wins`, `ties`, `losses`, `points`, `pointDifferential`, `rank`. */
  stats?: { name?: string; value?: number; displayValue?: string }[];
}

export interface EspnOdds {
  provider?: { id?: string; name?: string };
  details?: string;
  /** Cotes américaines : -550 signifie « miser 550 pour gagner 100 ». */
  homeTeamOdds?: { favorite?: boolean; moneyLine?: number };
  awayTeamOdds?: { favorite?: boolean; moneyLine?: number };
  drawOdds?: { moneyLine?: number; value?: number };
}

// ───────────────────────────── Nos propres repères ───────────────────────────

/**
 * Les identifiants de championnat chez ESPN, pour ceux qui nous concernent.
 *
 * La liste est bien plus longue ; on ne garde que ce que KZ TV commente, plus
 * de quoi tester. Le nom qui suit est notre identifiant d'habillage, ce qui
 * fait que choisir une ligue choisit aussi le thème.
 */
export const LIGUES: Record<string, { nom: string; theme: string }> = {
  'uefa.champions': { nom: 'Ligue des Champions', theme: 'ucl' },
  'uefa.europa': { nom: 'Ligue Europa', theme: 'europa' },
  'uefa.europa.conf': { nom: 'Ligue Conférence', theme: 'conference' },
  'uefa.super_cup': { nom: 'Supercoupe d’Europe', theme: 'ucl' },
  'fra.1': { nom: 'Ligue 1', theme: 'ligue1' },
  'fra.coupe_de_france': { nom: 'Coupe de France', theme: 'coupedefrance' },
  'eng.1': { nom: 'Premier League', theme: 'premier' },
  'eng.fa': { nom: 'FA Cup', theme: 'premier' },
  'esp.1': { nom: 'Liga', theme: 'liga' },
  'esp.copa_del_rey': { nom: 'Coupe du Roi', theme: 'liga' },
  'ita.1': { nom: 'Serie A', theme: 'seriea' },
  'ita.coppa_italia': { nom: 'Coupe d’Italie', theme: 'seriea' },
  'ger.1': { nom: 'Bundesliga', theme: 'bundesliga' },
  'ger.dfb_pokal': { nom: 'Coupe d’Allemagne', theme: 'bundesliga' },
};

/**
 * Le maillot, déduit du nom du club.
 *
 * ESPN ne dit pas si une équipe joue rayé. Rayer tout le monde est faux et se
 * voit ; ne rayer personne est faux aussi, mais discrètement. On traite donc à
 * la main la poignée de clubs dont la rayure est l'identité même, et le reste
 * reste uni. C'est une heuristique assumée, pas une donnée.
 */
export function maillotDeviné(nom: string): Kit | undefined {
  const n = nom.toLowerCase();
  if (/barcelona|atlético|atletico|athletic club|crystal palace|sunderland|newcastle|juventus|inter |internazionale|milan|brighton|qpr|queens park/.test(n)) {
    return 'striped';
  }
  if (/celtic|sporting|hoops/.test(n)) return 'hoops';
  return undefined;
}
