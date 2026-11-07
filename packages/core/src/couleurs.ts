/**
 * Deux équipes, deux couleurs qu'on puisse distinguer.
 *
 * ── Le défaut, trouvé sur un vrai match ─────────────────────────────────────
 *
 * Vitória joue en #C6101C, Fluminense en #7E0202. Deux rouges sombres. Sur la
 * carte des tirs, les pastilles des deux équipes devenaient la même tache ;
 * au fil du match, le liseré de camp ne distinguait plus rien. Le plateau
 * affichait une information juste dans une forme illisible, ce qui revient au
 * même qu'une information fausse.
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 *
 * On garde les vraies couleurs tant qu'elles se distinguent — c'est ce qui
 * fait qu'un plateau ressemble au match. Sinon on essaie la couleur ALTERNÉE
 * de l'équipe extérieure, que les fournisseurs publient presque toujours et
 * qui est, par construction, celle que le club porte justement quand ses
 * couleurs se confondent avec l'adversaire. Pour Fluminense, c'est #417505 :
 * le vert de son maillot. En dernier recours seulement, une paire imposée.
 *
 * C'est exactement la logique du maillot extérieur au football, et elle donne
 * le même résultat qu'à la télévision.
 */

import type { Team, TeamBrief } from './types.js';

/** Ce que porte une équipe, au minimum, pour cette décision. */
type Habillee = Pick<Team, 'color'> & { colorAlt?: string };

/**
 * La paire imposée quand rien d'autre ne marche.
 *
 * Bleu et ambre : la paire la plus sûre qui soit, lisible pour les daltonismes
 * rouge-vert comme bleu-jaune, et qui ne ressemble à aucun maillot au point de
 * laisser croire qu'on affiche la vraie couleur.
 */
export const PAIRE_DE_SECOURS = ['#3F7DDE', '#E3A83B'] as const;

/** Un `#rrggbb` ou `rrggbb` en composantes, ou `null` si ce n'en est pas un. */
function composantes(hex: string): [number, number, number] | null {
  const net = hex.trim().replace(/^#/, '');
  const plein = net.length === 3 ? net.replace(/./g, (c) => c + c) : net;
  if (!/^[0-9a-fA-F]{6}$/.test(plein)) return null;
  return [
    Number.parseInt(plein.slice(0, 2), 16),
    Number.parseInt(plein.slice(2, 4), 16),
    Number.parseInt(plein.slice(4, 6), 16),
  ];
}

/**
 * À quel point deux couleurs se distinguent, de 0 à 1.
 *
 * Distance euclidienne pondérée « redmean », qui approche la perception bien
 * mieux qu'une distance RVB brute pour un coût de trois multiplications. On ne
 * passe pas par un espace perceptuel complet : ce calcul tourne à chaque image
 * dans OBS, et la décision qu'il sert — « est-ce assez différent ? » — ne
 * demande pas cette précision-là.
 */
export function ecart(a: string, b: string): number {
  const ca = composantes(a);
  const cb = composantes(b);
  if (!ca || !cb) return 1;
  const rouge = (ca[0] + cb[0]) / 2;
  const dr = ca[0] - cb[0];
  const dg = ca[1] - cb[1];
  const db = ca[2] - cb[2];
  const d = Math.sqrt(
    (2 + rouge / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rouge) / 256) * db * db,
  );
  // 764 est la distance maximale possible avec cette pondération.
  return Math.min(1, d / 764);
}

// ── La lisibilité sur fond sombre ───────────────────────────────────────────

function versHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function depuisHsl(h: number, s: number, l: number): string {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Clarté minimale pour qu'une couleur se détache d'un plateau sombre. */
export const CLARTE_MINIMALE = 0.52;

/**
 * La même couleur, mais visible sur le plateau.
 *
 * Un club sur deux porte un bordeaux, un marine ou un vert bouteille. Posés à
 * l'identique sur un fond déjà sombre, ils deviennent du gris : le liseré du
 * fil disparaît, les pastilles de la carte des tirs se confondent avec le
 * terrain. Vérifié sur Fluminense, dont le #7E0202 était strictement
 * indiscernable du panneau.
 *
 * On monte donc la CLARTÉ sans toucher à la teinte : le rouge reste rouge, le
 * vert reste vert, et le spectateur reconnaît toujours son équipe. Une couleur
 * déjà claire — un maillot blanc — n'est pas modifiée.
 */
export function lisible(hex: string | undefined): string | null {
  if (!hex) return null;
  const c = composantes(hex);
  if (!c) return null;
  const [h, s, l] = versHsl(c);
  if (l >= CLARTE_MINIMALE) return depuisHsl(h, s, l);
  // Un gris très sombre n'a pas de teinte à préserver : l'éclaircir donnerait
  // un gris moyen qu'on confondrait avec le fond du panneau. On lui donne un
  // minimum de saturation pour qu'il devienne une vraie couleur.
  return depuisHsl(h, Math.max(s, 0.25), CLARTE_MINIMALE);
}

/**
 * Le seuil au-delà duquel deux couleurs sont « différentes ».
 *
 * Réglé sur des cas réels plutôt que par principe : Vitória contre Fluminense
 * (0,13) doit basculer, Lyon contre Marseille — bleu contre blanc — doit être
 * gardé. Le monter davantage ferait perdre des paires parfaitement lisibles.
 */
export const SEUIL_ECART = 0.2;

export interface PaireCouleurs {
  home: string;
  away: string;
  /** La couleur d'origine d'une équipe a-t-elle dû être remplacée ? */
  substitue: 'none' | 'away' | 'both';
}

/**
 * Les deux couleurs à employer pour ce match, partout.
 *
 * Fonction PURE, et c'est essentiel : les deux sources navigateur d'OBS
 * doivent arriver à la même paire, et la carte des tirs doit employer
 * exactement celle du fil du match. Une règle recalculée différemment d'un
 * bloc à l'autre redonnerait deux rouges identiques quelque part.
 */
export function paireCouleurs(
  home: Habillee | TeamBrief | undefined,
  away: Habillee | TeamBrief | undefined,
): PaireCouleurs {
  // On éclaircit AVANT de comparer : deux bordeaux remontés à la même clarté
  // restent deux rouges voisins, et c'est bien la paire telle qu'elle sera
  // affichée qu'il faut juger, pas celle du fichier du club.
  const dom = lisible(home?.color) ?? PAIRE_DE_SECOURS[0];
  const ext = lisible(away?.color) ?? PAIRE_DE_SECOURS[1];

  if (ecart(dom, ext) >= SEUIL_ECART) return { home: dom, away: ext, substitue: 'none' };

  // Le maillot extérieur existe pour ce cas précis.
  const alt = lisible(away?.colorAlt);
  if (alt && ecart(dom, alt) >= SEUIL_ECART) {
    return { home: dom, away: alt, substitue: 'away' };
  }

  // Et si le club n'a pas de seconde couleur lisible non plus, on abandonne
  // les deux : garder l'une des deux vraies ferait croire que l'autre l'est
  // aussi.
  return { home: PAIRE_DE_SECOURS[0], away: PAIRE_DE_SECOURS[1], substitue: 'both' };
}
