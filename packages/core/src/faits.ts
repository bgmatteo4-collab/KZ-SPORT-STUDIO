/**
 * Le vocabulaire des faits de jeu.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 *
 * Avant lui, chaque bloc inventait sa propre lecture du match. Le pressure
 * index avait sa table de poids dans le réducteur ; les cartons avaient leurs
 * libellés dans le scorebug ; la carte des tirs traduisait `on_target` en
 * français dans son CSS. Trois blocs, trois vocabulaires, et aucun moyen de
 * dire « le momentum monte PARCE QUE ces trois tirs-là ».
 *
 * Ici, un fait a un type, un poids de danger et un libellé — une fois pour
 * toutes. Le réducteur s'en sert pour remplir le fil ET la pression ; les
 * widgets s'en servent pour écrire. C'est ce qui permet au fil de citer le tir
 * que la carte vient d'afficher, et au momentum d'expliquer sa courbe.
 *
 * ── Ce qui est volontairement absent ────────────────────────────────────────
 *
 * Aucune phrase de commentaire. ESPN en fournit en anglais, et les traduire
 * mal serait pire que de ne rien dire : un libellé court et juste (« Tir
 * cadré ») tient à l'antenne, une phrase approximative se lit comme une faute.
 */

import type { Pair, Player, Side } from './types.js';

/**
 * Ce qui peut arriver dans un match, du point de vue de l'antenne.
 *
 * Les quatre issues de frappe sont des types distincts, et pas un type « tir »
 * avec un attribut : un tir contré et un tir à côté ne pèsent pas pareil, ne
 * s'écrivent pas pareil, et ne se dessinent pas pareil. Les fondre reviendrait
 * à refaire partout le `switch` qu'on évite ici.
 */
export type FaitKind =
  | 'goal'
  | 'own_goal'
  | 'penalty_goal'
  | 'penalty_awarded'
  | 'shot_on'
  | 'shot_blocked'
  | 'shot_off'
  | 'corner'
  | 'offside'
  | 'free_kick'
  | 'yellow'
  | 'second_yellow'
  | 'red'
  | 'sub';

/**
 * Le poids d'un fait dans le danger, de 0 à 5.
 *
 * C'est la MÊME table qui nourrit le pressure index et la hiérarchie du fil :
 * un fait qui pousse la courbe est un fait qui s'affiche gros. Avant, les deux
 * échelles vivaient séparément et pouvaient se contredire à l'écran — une
 * courbe qui montait sans qu'aucun fait visible ne l'explique.
 *
 * Un carton et un remplacement pèsent zéro : ils ne créent pas de danger. Ils
 * restent au fil, parce qu'ils racontent le match, mais ils ne doivent pas
 * faire monter une courbe de pression.
 */
export const POIDS: Record<FaitKind, number> = {
  penalty_goal: 5,
  penalty_awarded: 5,
  goal: 4,
  own_goal: 4,
  shot_on: 3,
  shot_blocked: 2,
  shot_off: 2,
  corner: 2,
  free_kick: 1,
  offside: 1,
  yellow: 0,
  second_yellow: 0,
  red: 0,
  sub: 0,
};

/**
 * Ce qu'un fait vaut AU FIL — qui n'est pas ce qu'il pèse en danger.
 *
 * Un carton rouge ne crée aucune occasion : il pèse zéro dans la courbe. Mais
 * c'est le fait le plus important du match après un but, et le masquer parce
 * que la place manque serait absurde. Un corner, à l'inverse, pousse vraiment
 * la pression sans mériter une ligne quand il y en a douze.
 *
 * Deux échelles, donc, et assumées : l'une dit le DANGER, l'autre dit
 * l'INTÉRÊT. Les confondre, c'était afficher trois corners d'affilée et perdre
 * l'expulsion.
 */
export const VALEUR_FIL: Record<FaitKind, number> = {
  goal: 5,
  own_goal: 5,
  penalty_goal: 5,
  red: 5,
  second_yellow: 4,
  penalty_awarded: 4,
  shot_on: 3,
  yellow: 3,
  // Un remplacement vaut moins qu'un tir cadré, et c'est une correction tirée
  // de l'écran : à la fin d'un match, les six derniers faits sont presque
  // toujours des changements, et le fil n'affichait plus qu'eux. Ils racontent
  // la gestion d'une fin de match, pas le match.
  sub: 2,
  shot_blocked: 2,
  shot_off: 2,
  corner: 1,
  offside: 1,
  free_kick: 1,
};

/** Le libellé d'antenne. Court : il doit tenir sur une ligne de fil. */
export const LIBELLE: Record<FaitKind, string> = {
  goal: 'But',
  own_goal: 'But contre son camp',
  penalty_goal: 'But sur penalty',
  penalty_awarded: 'Penalty',
  shot_on: 'Tir cadré',
  shot_blocked: 'Tir contré',
  shot_off: 'Tir non cadré',
  corner: 'Corner',
  offside: 'Hors-jeu',
  free_kick: 'Coup franc',
  yellow: 'Carton jaune',
  second_yellow: 'Second jaune',
  red: 'Carton rouge',
  sub: 'Remplacement',
};

/**
 * Le pluriel, écrit et non deviné.
 *
 * « Tir cadré » au pluriel n'est pas « Tir cadrés » : l'accord porte sur les
 * deux mots. Une règle automatique se tromperait sur la moitié de cette table,
 * et « 3 Carton jaunes » à l'antenne est le genre de détail qui fait amateur.
 */
export const LIBELLE_PLURIEL: Record<FaitKind, string> = {
  goal: 'buts',
  own_goal: 'buts contre son camp',
  penalty_goal: 'buts sur penalty',
  penalty_awarded: 'penalties',
  shot_on: 'tirs cadrés',
  shot_blocked: 'tirs contrés',
  shot_off: 'tirs non cadrés',
  corner: 'corners',
  offside: 'hors-jeu',
  free_kick: 'coups francs',
  yellow: 'cartons jaunes',
  second_yellow: 'seconds jaunes',
  red: 'cartons rouges',
  sub: 'remplacements',
};

/**
 * Ce qui pousse la pression sans mériter une ligne de fil.
 *
 * Un « temps fort » n'est pas un fait : il n'a pas d'instant précis, pas
 * d'auteur, et en lister trente remplirait le fil de lignes que personne ne
 * lit. Il pèse pourtant sur la courbe, donc il doit exister dans la table des
 * poids — d'où ce type à part plutôt qu'un `FaitKind` de plus.
 *
 * Aucun fournisseur gratuit n'en publie aujourd'hui ; le simulateur, si.
 */
export type PousseeKind = FaitKind | 'attaque' | 'attaque_dangereuse';

export const POIDS_POUSSEE: Record<PousseeKind, number> = {
  ...POIDS,
  attaque_dangereuse: 2,
  attaque: 1,
};

export const LIBELLE_POUSSEE: Record<PousseeKind, string> = {
  ...LIBELLE,
  attaque_dangereuse: 'Action dangereuse',
  attaque: 'Temps fort',
};

export const PLURIEL_POUSSEE: Record<PousseeKind, string> = {
  ...LIBELLE_PLURIEL,
  attaque_dangereuse: 'actions dangereuses',
  attaque: 'temps forts',
};

/**
 * « 3 tirs cadrés · 2 corners » : ce qui a produit la pression, écrit.
 *
 * C'est la pièce qui manquait pour que la courbe de momentum cesse d'être une
 * affirmation. Une courbe qui monte sans raison visible ressemble à un bug ;
 * la même courbe avec sa cause écrite en dessous devient une analyse.
 *
 * Le classement est par poids décroissant — un tir cadré avant un corner —
 * puis par nombre : on cite d'abord ce qui a fait le danger.
 */
export function pourquoi(
  echantillons: readonly { kind: PousseeKind }[],
  combien = 3,
): string {
  const comptes = new Map<PousseeKind, number>();
  for (const e of echantillons) comptes.set(e.kind, (comptes.get(e.kind) ?? 0) + 1);
  return [...comptes.entries()]
    .sort((a, b) => POIDS_POUSSEE[b[0]] - POIDS_POUSSEE[a[0]] || b[1] - a[1])
    .slice(0, combien)
    .map(([kind, n]) => `${n} ${n > 1 ? PLURIEL_POUSSEE[kind] : LIBELLE_POUSSEE[kind].toLowerCase()}`)
    .join(' · ');
}

/**
 * Les familles, pour filtrer sans énumérer.
 *
 * `BUTS` sert au fil et au recap ; `TIRS` sert à la carte ; `DANGER` sert au
 * momentum, qui ne doit tracer que ce qui crée une occasion.
 */
export const BUTS: readonly FaitKind[] = ['goal', 'own_goal', 'penalty_goal'];
export const TIRS: readonly FaitKind[] = [
  'goal',
  'own_goal',
  'penalty_goal',
  'shot_on',
  'shot_blocked',
  'shot_off',
];
export const DISCIPLINE: readonly FaitKind[] = ['yellow', 'second_yellow', 'red'];

export function estBut(kind: FaitKind): boolean {
  return BUTS.includes(kind);
}

export function estTir(kind: FaitKind): boolean {
  return TIRS.includes(kind);
}

/**
 * Les `n` tout derniers faits, sans tri ni sélection.
 *
 * C'est ce qu'il faut pour le bandeau permanent du direct, qui répond à une
 * seule question : « qu'est-ce qui vient de se passer ? ». Un but de la 3e
 * minute n'y a plus rien à faire à la 80e — il est déjà au score, et le
 * spectateur qui vient d'arriver veut savoir où en est le jeu MAINTENANT.
 */
export function derniersFaits(feed: readonly FaitEntry[], combien: number): FaitEntry[] {
  if (combien <= 0) return [];
  return feed.slice(Math.max(0, feed.length - combien));
}

/**
 * Le fil du match : `n` faits qui RACONTENT la rencontre, dans l'ordre.
 *
 * ── Pourquoi ce n'est pas la même chose que « les n derniers » ──────────────
 *
 * Tronquer par la fin donne, à la 70e minute d'un match haché, trois corners
 * et un coup franc : la place est prise et l'expulsion de la 68e a disparu.
 * Trier par importance casse la chronologie, et un fil qui n'est pas
 * chronologique n'est plus un fil.
 *
 * Alors on choisit CE QU'ON JETTE plutôt que ce qu'on garde : on retire
 * d'abord le moins intéressant, et à intérêt égal le plus ancien. On perd donc
 * les corners avant les tirs, et les tirs avant les buts — puis on réaffiche
 * les survivants dans l'ordre du match.
 */
export function filDuMatch(feed: readonly FaitEntry[], combien: number): FaitEntry[] {
  if (combien <= 0) return [];
  if (feed.length <= combien) return [...feed];

  const aJeter = feed.length - combien;
  const ordreDeSacrifice = feed
    .map((fait, index) => ({ fait, index }))
    .sort((a, b) => VALEUR_FIL[a.fait.kind] - VALEUR_FIL[b.fait.kind] || a.fait.t - b.fait.t);

  const jetes = new Set(ordreDeSacrifice.slice(0, aJeter).map((e) => e.index));
  return feed.filter((_, index) => !jetes.has(index));
}

/**
 * Un fait consolidé, tel qu'il entre au fil du match.
 *
 * `seq` et `t` viennent de l'événement d'origine : le fil est donc ordonnable
 * et idempotent comme le reste, et un rechargement redonne exactement la même
 * liste.
 */
export interface FaitEntry {
  seq: number;
  t: number;
  /** Minute d'antenne, déjà formatée : « 45+2 ». */
  minute: string;
  side: Side;
  kind: FaitKind;
  /** L'auteur : buteur, tireur, averti, sortant. */
  player?: Player;
  /** Le second rôle : passeur, ou entrant. */
  second?: Player;
  /** Où, relativement au but attaqué, quand on le sait. */
  x?: number;
  y?: number;
  /** Le score APRÈS le fait, pour les buts seulement. */
  score?: Pair;
}

// ── La géométrie du terrain ─────────────────────────────────────────────────
//
// Les positions arrivent sur [0,100] en longueur comme en largeur. Pour parler
// de DISTANCE il faut repasser en mètres, sinon « à 30 unités du but » ne dit
// rien à personne. Dimensions FIFA d'un terrain d'élite.

const LONGUEUR_M = 105;
const LARGEUR_M = 68;

/**
 * Dans la surface de réparation, ou non.
 *
 * C'est le seul seuil de danger qui soit objectif : une frappe prise dans les
 * seize mètres est d'une autre nature qu'une tentative de trente mètres, et
 * compter les deux dans le même « 14 tirs » efface précisément la différence
 * qu'on cherche à dire. Les bornes sont celles du terrain — 16,5 m de la ligne
 * de but, 20,15 m de l'axe — converties en unités de 0 à 100.
 */
export function dansLaSurface(fait: { x?: number; y?: number }): boolean {
  if (fait.x === undefined || fait.y === undefined) return false;
  return fait.x >= 84.3 && Math.abs(fait.y - 50) <= 29.6;
}

/**
 * La distance au but attaqué, en mètres, ou `null` sans position.
 *
 * C'est l'information que la radio donne et que les tableaux ne donnent
 * jamais : « neuf tirs » ne dit pas s'ils partaient de la surface ou de
 * trente mètres. Deux matchs aux statistiques identiques n'ont alors
 * strictement rien à voir.
 */
export function distanceDuBut(fait: { x?: number; y?: number }): number | null {
  if (fait.x === undefined || fait.y === undefined) return null;
  const dx = ((100 - fait.x) / 100) * LONGUEUR_M;
  const dy = ((fait.y - 50) / 100) * LARGEUR_M;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Où la frappe a été tentée, en français.
 *
 * Les seuils sont ceux du terrain réel, pas des arrondis : la surface court
 * jusqu'à 16,5 m de la ligne de but et 20,15 m de l'axe, ce qui donne, en
 * unités de 0 à 100, un `x` au-delà de 84,3 et un écart à l'axe sous 29,6.
 *
 * On ne dit jamais « à gauche » ou « à droite » : la gauche d'une équipe est
 * la droite de l'autre, et le spectateur, qui n'a pas les images, n'a aucun
 * moyen de trancher. « Excentré » est moins précis mais toujours vrai.
 */
export function zoneDuTir(fait: { x?: number; y?: number }): string | null {
  if (fait.x === undefined || fait.y === undefined) return null;
  const ecart = Math.abs(fait.y - 50);
  const dansLaSurface = fait.x >= 84.3 && ecart <= 29.6;
  const axe = ecart <= 12 ? 'dans l’axe' : ecart <= 24 ? 'légèrement excentré' : 'très excentré';

  if (fait.x >= 94.3 && ecart <= 9.9) return `des six mètres, ${axe}`;
  if (dansLaSurface) return `dans la surface, ${axe}`;
  const metres = distanceDuBut(fait);
  if (metres === null) return axe;
  return `à ${Math.round(metres)} m, ${axe}`;
}

/** La même chose en très court, pour une ligne de fil étroite. */
export function distanceCourte(fait: { x?: number; y?: number }): string | null {
  const metres = distanceDuBut(fait);
  return metres === null ? null : `${Math.round(metres)} m`;
}

/**
 * La zone sans la précision d'axe, pour une colonne étroite.
 *
 * « Hulk, dans la surface, dans l'axe » tient dans une feuille de match large
 * de mille pixels et se termine en « dans l'a… » dans une colonne de deux
 * cent quarante. Mieux vaut une vérité plus courte qu'une vérité coupée : on
 * garde le lieu, qui porte le danger, et on abandonne l'axe, qui le nuance.
 */
export function zoneCourte(fait: { x?: number; y?: number }): string | null {
  if (fait.x === undefined || fait.y === undefined) return null;
  const ecart = Math.abs(fait.y - 50);
  if (fait.x >= 94.3 && ecart <= 9.9) return 'des six mètres';
  if (fait.x >= 84.3 && ecart <= 29.6) return 'dans la surface';
  return distanceCourte(fait);
}

/**
 * Le texte d'une ligne de fil : qui, et le cas échéant d'où.
 *
 * Volontairement sans verbe. Un fil d'antenne est une liste de faits, pas un
 * récit : « Mbappé, dans la surface, dans l’axe » se lit d'un coup d'œil, là
 * où « Mbappé a frappé depuis la surface » demande une lecture.
 */
export function detailDuFait(fait: FaitEntry, court = false): string {
  const bouts: string[] = [];
  if (fait.player) bouts.push(fait.player.short);

  if (estTir(fait.kind)) {
    const zone = court ? zoneCourte(fait) : zoneDuTir(fait);
    if (zone) bouts.push(zone);
  }

  if (fait.kind === 'goal' || fait.kind === 'penalty_goal') {
    // Le passeur saute en premier quand la place manque : il complète
    // l'action, il ne la décrit pas.
    if (fait.second && !court) bouts.push(`passe de ${fait.second.short}`);
  }

  if (fait.kind === 'sub') {
    const sortant = fait.player?.short;
    const entrant = fait.second?.short;
    if (sortant && entrant) return `${entrant} remplace ${sortant}`;
    if (entrant) return `${entrant} entre en jeu`;
    if (sortant) return `${sortant} sort`;
    return '';
  }

  return bouts.join(', ');
}
