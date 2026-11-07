/**
 * Le classement, rapporté au match qu'on commente.
 *
 * ── Le défaut que ça corrige ────────────────────────────────────────────────
 *
 * La régie automatique montre le classement après un but, avec ce motif :
 * « c'est ce que le spectateur se demande ». Sauf que le tableau affiché ne
 * contenait aucune trace du but. Il venait du fournisseur, qui ne le met à
 * jour qu'après le coup de sifflet final — vérifié sur Vitória–Fluminense, où
 * les deux équipes étaient encore à 33 journées quand le reste du championnat
 * en comptait 34. On répondait donc à la question par le tableau d'hier.
 *
 * Ici, on applique le résultat en cours : trois points au vainqueur, un
 * partout en cas de nul, la différence de buts mise à jour, puis on reclasse.
 * Le panneau peut alors dire « si le match finissait ainsi » — ce qui est
 * l'insert que fait la télévision, et la seule réponse honnête.
 *
 * ── Le garde-fou, qui n'est pas décoratif ───────────────────────────────────
 *
 * Si le fournisseur avait DÉJÀ compté le match, projeter une seconde fois
 * donnerait six points pour une victoire. On ne le devine pas : on compare le
 * nombre de journées jouées par les deux équipes au maximum du championnat.
 * Une équipe déjà à jour n'est pas projetée, et le panneau le dit.
 */

import type { MatchPhase, Pair, StandingRow, TeamBrief } from './types.js';

export interface LigneProjetee extends StandingRow {
  /** Cette ligne est-elle une des deux équipes qui jouent ? */
  enJeu: boolean;
  /** Mouvement par rapport au tableau publié. +2 : gagne deux places. */
  bouge: number;
}

export interface Projection {
  rows: LigneProjetee[];
  /** Le résultat en cours a-t-il réellement été appliqué ? */
  projete: boolean;
  /** Pourquoi il ne l'a pas été, le cas échéant. */
  raison: 'pas-commence' | 'deja-compte' | 'equipes-absentes' | null;
}

/** Les phases où le match a produit un résultat qui vaut la peine d'être projeté. */
const PHASES_COMPTEES: MatchPhase[] = [
  'first_half',
  'half_time',
  'second_half',
  'extra_break',
  'extra_first',
  'extra_half',
  'extra_second',
  'penalties',
  'full_time',
];

/**
 * Reconnaît une équipe d'une liste à l'autre.
 *
 * L'identifiant d'abord, le nom d'antenne ensuite. Le nom seul suffisait tant
 * que la même source écrivait les deux listes ; il ne suffirait plus le jour
 * où l'une dit « Paris Saint-Germain » et l'autre « PSG ».
 */
function memeEquipe(a: TeamBrief | undefined, b: TeamBrief | undefined): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return a.short === b.short;
}

/**
 * Le classement tel qu'il serait si le match se terminait sur ce score.
 *
 * Fonction PURE : mêmes entrées, même sortie. C'est ce qui permet aux deux
 * sources navigateur d'OBS d'afficher exactement le même tableau.
 */
export function classementProjete(
  rows: readonly StandingRow[],
  home: TeamBrief | undefined,
  away: TeamBrief | undefined,
  score: Pair,
  phase: MatchPhase,
): Projection {
  const base = rows.map((r) => ({ ...r, enJeu: memeEquipe(r.team, home) || memeEquipe(r.team, away), bouge: 0 }));

  const iDom = base.findIndex((r) => memeEquipe(r.team, home));
  const iExt = base.findIndex((r) => memeEquipe(r.team, away));
  if (iDom < 0 || iExt < 0) return { rows: base, projete: false, raison: 'equipes-absentes' };
  if (!PHASES_COMPTEES.includes(phase)) return { rows: base, projete: false, raison: 'pas-commence' };

  // Le fournisseur a-t-il déjà intégré la rencontre ? Les deux équipes ont
  // alors autant de journées que les plus avancées du championnat.
  const journeesMax = Math.max(...base.map((r) => r.played));
  if (base[iDom]!.played >= journeesMax && base[iExt]!.played >= journeesMax) {
    return { rows: base, projete: false, raison: 'deja-compte' };
  }

  const [butsDom, butsExt] = score;
  const nul = butsDom === butsExt;
  const pointsDom = nul ? 1 : butsDom > butsExt ? 3 : 0;
  const pointsExt = nul ? 1 : butsExt > butsDom ? 3 : 0;

  const projetees = base.map((r, i) => {
    if (i !== iDom && i !== iExt) return r;
    const dom = i === iDom;
    return {
      ...r,
      played: r.played + 1,
      points: r.points + (dom ? pointsDom : pointsExt),
      diff: r.diff + (dom ? butsDom - butsExt : butsExt - butsDom),
    };
  });

  // Reclassement : points, puis différence de buts. C'est la règle de la
  // plupart des championnats ; celles qui départagent autrement — les
  // confrontations directes en Serie A — demanderaient une donnée qu'aucune
  // source gratuite ne publie, et le panneau annonce « si le match finissait
  // ainsi », pas « classement officiel ».
  const trie = [...projetees].sort((a, b) => b.points - a.points || b.diff - a.diff || a.rank - b.rank);

  return {
    rows: trie.map((r, index) => ({
      ...r,
      rank: index + 1,
      // Le mouvement se mesure contre le rang PUBLIÉ, celui que le spectateur
      // avait en tête avant le but.
      bouge: r.rank - (index + 1),
    })),
    projete: true,
    raison: null,
  };
}

/**
 * La tranche de tableau à montrer quand tout ne tient pas.
 *
 * ── Pourquoi pas simplement le haut ─────────────────────────────────────────
 *
 * Une colonne de cinq cents pixels tient huit lignes. Montrer les huit
 * premières d'un championnat à vingt affiche Fluminense, 4e… et pas Vitória,
 * 15e, alors que c'est précisément le match à l'antenne. Le panneau devient
 * décoratif au moment où on l'ouvre pour une raison.
 *
 * On garde donc le haut du tableau — qui porte le titre, et que tout le monde
 * veut voir — et on s'assure que les deux équipes qui jouent y figurent, en
 * glissant la fenêtre si besoin.
 */
export function tranche<T extends { enJeu?: boolean }>(rows: readonly T[], combien: number): T[] {
  if (combien <= 0) return [];
  if (rows.length <= combien) return [...rows];

  const enJeu = rows.map((r, i) => (r.enJeu ? i : -1)).filter((i) => i >= 0);
  if (enJeu.length === 0) return rows.slice(0, combien);

  const dernier = Math.max(...enJeu);
  if (dernier < combien) return rows.slice(0, combien);

  // Le bas de la fenêtre doit atteindre l'équipe la plus mal classée des deux.
  // On réserve le tiers haut du cadre au sommet du tableau : sans lui, un
  // match de bas de tableau donnerait une liste qui commence à la 12e place
  // et ne dit plus de quel championnat il s'agit.
  const tete = Math.max(1, Math.floor(combien / 3));
  const reste = combien - tete;
  const debut = Math.min(Math.max(0, dernier - reste + 1), rows.length - reste);
  return [...rows.slice(0, tete), ...rows.slice(debut, debut + reste)];
}
