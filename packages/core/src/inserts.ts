/**
 * Les inserts : la régie automatique.
 *
 * Un streamer seul ne peut pas commenter ET piloter un mélangeur. Les panneaux
 * secondaires — statistiques, classement, momentum — viennent donc tout seuls
 * pendant le match, tiennent quelques secondes, puis rendent la place.
 *
 * ── Deux règles qui décident de tout ─────────────────────────────────────────
 *
 * 1. DÉTERMINISTE. Pas de `Math.random()`. Les deux sources navigateur d'OBS
 *    sont deux navigateurs distincts : si chacun tirait au sort, ils
 *    afficheraient deux choses différentes. Et un rechargement changerait
 *    l'écran. La variété est donc dérivée de la timeline — même timeline, même
 *    instant, même insert, partout et toujours.
 *
 * 2. MOTIVÉ. Ce qui fait professionnel n'est pas le hasard, c'est la raison.
 *    Après un but on montre le classement, parce que c'est ce que le
 *    spectateur se demande. Dans un temps mort on montre les statistiques,
 *    parce qu'il n'y a rien d'autre à dire. Un insert au hasard juste après un
 *    but passerait pour une panne.
 */

import type { MatchPhase, MatchState } from './types.js';

export interface InsertSpec {
  id: string;
  /** Clé du widget dans le registre. */
  widget: string;
  /** Combien de temps il reste à l'écran, en ms de temps de match. */
  holdMs: number;
  opts?: Record<string, unknown>;
}

/** Ce qui est à l'écran à un instant donné, le cas échéant. */
export interface InsertActif {
  spec: InsertSpec;
  /** Début de la fenêtre, en temps mural. Sert à animer l'entrée. */
  from: number;
  to: number;
  /** Pourquoi il est là — affiché en régie, utile pour comprendre. */
  motif: string;
}

const SEC = 1_000;

/**
 * Le catalogue. Ajouter un insert, c'est ajouter une entrée ici — pas écrire
 * de la logique.
 */
/**
 * Un insert ne doit montrer que ce qui n'est PAS déjà à l'écran.
 *
 * Les statistiques ont quitté cette liste le jour où elles ont pris la colonne
 * de gauche en permanence : un insert qui remplace les statistiques par les
 * mêmes statistiques n'est pas une respiration, c'est une panne qui ne se voit
 * pas.
 */
export const INSERTS: InsertSpec[] = [
  { id: 'classement', widget: 'standings', holdMs: 14 * SEC },
  { id: 'momentum', widget: 'momentum', holdMs: 12 * SEC },
];

/** Les périodes pendant lesquelles un insert a du sens. */
const PHASES_ACTIVES: MatchPhase[] = ['first_half', 'second_half', 'extra_first', 'extra_second'];

/**
 * Après un but, le carton plein écran occupe l'antenne. On ne lui marche pas
 * dessus : l'insert motivé arrive une fois qu'il est sorti.
 */
const APRES_BUT = 14 * SEC;
/** Le carton de but dure un peu plus de cinq secondes. */
const SILENCE_APRES_FAIT = 8 * SEC;
/** Le fond de roulement : un insert toutes les deux minutes de jeu. */
const PERIODE_ROTATION = 120 * SEC;

/**
 * Suite déterministe à partir d'un entier. Donne de la variété sans hasard :
 * la même timeline produit toujours la même succession d'inserts.
 */
function melange(graine: number): number {
  let x = (graine + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}

/** Choisit un insert dans le catalogue, en évitant de répéter le précédent. */
function choisir(graine: number, interdit?: string): InsertSpec {
  const possibles = interdit ? INSERTS.filter((i) => i.id !== interdit) : INSERTS;
  const liste = possibles.length > 0 ? possibles : INSERTS;
  return liste[Math.floor(melange(graine) * liste.length) % liste.length]!;
}

/**
 * L'insert du énième tour de rotation.
 *
 * ── Pourquoi une marche, et pas un tirage ───────────────────────────────────
 *
 * La première version tirait le tour `i` en lui interdisant le résultat d'un
 * tour `i-1` RECALCULÉ sans sa propre contrainte. Les deux chaînes
 * divergeaient, et le panneau pouvait se répéter. Avec trois panneaux le
 * défaut passait inaperçu ; en tombant à deux, il est devenu systématique.
 *
 * Ici, chaque tour avance d'un pas compris entre 1 et n-1. Un pas ne peut donc
 * jamais être un multiple de n : deux tours voisins tombent toujours sur deux
 * panneaux différents, par CONSTRUCTION et non par chance. Le pas varie avec le
 * numéro du tour, ce qui évite un cycle trop régulier.
 *
 * La boucle repart de zéro à chaque appel : quarante-cinq tours au plus pour un
 * match, c'est moins cher que la mémoire qu'il faudrait pour les retenir — et
 * ça garde la fonction PURE, donc identique sur les deux sources d'OBS.
 */
function choixRotation(tour: number): InsertSpec {
  const n = INSERTS.length;
  if (n <= 1) return INSERTS[0]!;
  let index = 0;
  for (let k = 1; k <= tour; k += 1) {
    index = (index + 1 + Math.floor(melange(k * 13) * (n - 1))) % n;
  }
  return INSERTS[index]!;
}

interface Fenetre {
  spec: InsertSpec;
  from: number;
  to: number;
  motif: string;
  /** Un insert motivé prime sur le fond de roulement. */
  priorite: number;
}

/**
 * Toutes les fenêtres d'insert que la timeline justifie, jusqu'à `t`.
 *
 * Fonction pure de l'état. C'est ce qui garantit que les deux couches d'OBS
 * montrent la même chose et qu'un rechargement ne change rien à l'écran.
 */
function fenetres(state: MatchState, t: number): Fenetre[] {
  const out: Fenetre[] = [];
  if (!PHASES_ACTIVES.includes(state.phase)) return out;

  // ── Motivés : après chaque but, une fois le carton sorti. ──
  for (const but of state.goals) {
    const debut = but.t + APRES_BUT;
    if (debut > t) continue;
    // Après un but, ce que le spectateur se demande, c'est où ça place les
    // équipes — donc le classement, puis les statistiques au but suivant.
    const spec = choisir(but.seq * 7 + 1);
    out.push({
      spec,
      from: debut,
      to: debut + spec.holdMs,
      motif: `après le but de ${but.scorer?.short ?? 'l’équipe'}`,
      priorite: 2,
    });
  }

  // ── Motivés : après un carton rouge, qui change le match. ──
  for (const carton of state.cards) {
    if (carton.card === 'yellow') continue;
    const debut = carton.t + SILENCE_APRES_FAIT;
    if (debut > t) continue;
    out.push({
      spec: INSERTS.find((i) => i.id === 'momentum') ?? INSERTS[0]!,
      from: debut,
      to: debut + 12 * SEC,
      motif: `après le carton rouge de ${carton.player?.short ?? 'un joueur'}`,
      priorite: 2,
    });
  }

  // ── Fond de roulement : pendant les temps morts. ──
  // Ancré sur le chrono du match, pas sur l'heure : deux spectateurs qui
  // rejoignent à des moments différents voient la même rotation.
  const depuisDebut = state.clockMs;
  const tours = Math.floor(depuisDebut / PERIODE_ROTATION);
  // Seules les deux dernières frontières peuvent encore être ouvertes : les
  // quarante-trois précédentes sont fermées depuis longtemps, et les recalculer
  // à chaque image serait payer pour rien dans OBS.
  for (let i = Math.max(1, tours - 1); i <= tours; i += 1) {
    const debut = t + (i * PERIODE_ROTATION - depuisDebut);
    const spec = choixRotation(i);
    out.push({
      spec,
      from: debut,
      to: debut + spec.holdMs,
      motif: 'temps mort',
      priorite: 1,
    });
  }

  return out;
}

/**
 * Ce qui doit être inséré à l'instant `t`, ou rien.
 *
 * On ne montre jamais un insert dans les secondes qui suivent un fait de jeu :
 * le carton plein écran a la priorité, et superposer les deux ferait désordre.
 */
export function insertActif(state: MatchState, t: number): InsertActif | null {
  if (!PHASES_ACTIVES.includes(state.phase)) return null;

  // Un fait vient de se produire : on laisse la place au carton.
  const dernierFait = Math.max(
    ...state.goals.map((g) => g.t),
    ...state.cards.map((c) => c.t),
    ...state.subs.map((s) => s.t),
    -Infinity,
  );
  if (Number.isFinite(dernierFait) && t - dernierFait < SILENCE_APRES_FAIT) return null;

  const candidates = fenetres(state, t).filter((f) => t >= f.from && t < f.to);
  if (candidates.length === 0) return null;

  // Le plus prioritaire, et à égalité le plus récemment ouvert.
  candidates.sort((a, b) => b.priorite - a.priorite || b.from - a.from);
  const gagnant = candidates[0]!;
  return { spec: gagnant.spec, from: gagnant.from, to: gagnant.to, motif: gagnant.motif };
}
