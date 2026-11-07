/**
 * Les habillages. Règle n°2 : zéro couleur, marge ou durée d'animation en dur
 * ailleurs qu'ici.
 *
 * Un thème habille TOUT le plateau — le fond compris. Ce n'est pas une palette
 * posée sur des widgets : c'est l'identité d'une chaîne de télévision déclinée
 * par compétition. Voir docs/HABILLAGE.md.
 */

export interface ThemeTokens {
  /** Les deux arrêts du dégradé de fond. Jamais noir, jamais transparent. */
  bgDeep: string;
  bgMid: string;
  /** La lueur radiale décentrée qui empêche le fond d'être plat. */
  glow: string;
  /** Un motif discret, en surimpression du dégradé. `none` si le thème est nu. */
  pattern: string;
  patternOpacity: string;

  panel: string;
  /** Bordure des panneaux : VIVE et saturée, pas un trait blanc qui s'efface. */
  panelLine: string;
  /** La lueur portée par cette bordure. C'est elle qui « remplit » le contour. */
  panelGlow: string;
  pill: string;
  pillLine: string;
  /** Le pavé d'un chiffre de score, plus clair que la bannière. */
  slab: string;

  ink: string;
  inkSoft: string;
  inkDim: string;

  /** L'or. Soulignement du chrono, gardien, détails. Jamais en aplat large. */
  accent: string;
  /**
   * Le teal et le teal clair de la marque.
   *
   * Le teal clair porte les surtitres — tout ce qui oriente la lecture sans
   * être l'information. C'est la seule couleur, avec l'accent, qui sorte du
   * gris sur un panneau : deux repères, pas douze.
   */
  teal: string;
  tealClair: string;
  live: string;
  win: string;
  lose: string;

  pitch: string;
  pitchStripe: string;
  pitchLine: string;
  /** Le ballon : ambre lumineux, il doit se détacher de la pelouse. */
  ball: string;
  /** L'envahissement sur un but. */
  goalFlood: string;

  /**
   * UNE seule famille, partout. La hiérarchie se fait par la graisse et la
   * chasse (axe `wdth` de la variable), jamais par un second caractère :
   * c'est ce qui donne l'unité d'un habillage de chaîne.
   */
  font: string;
  /**
   * Chasse des grands titres. LÉGÈREMENT RESSERRÉE : un titre d'antenne doit
   * remplir sa bande. Élargir aère et sonne creux.
   */
  widthDisplay: string;
  /** Chasse très resserrée des espaces contraints. */
  widthTight: string;
  /** Graisse des titres d'antenne. */
  weightDisplay: string;

  /** L'échelle de rayons. Quatre valeurs, pas une de plus. */
  radiusPanel: string;
  radiusCard: string;
  radiusChip: string;
  radiusPill: string;

  /** L'échelle d'espacement, base 4. Aucune marge en dur ailleurs. */
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s5: string;
  s6: string;

  shadow: string;
  shadowSoft: string;

  durFast: string;
  durBase: string;
  durSlow: string;
  ease: string;

  /**
   * ── La grammaire du mouvement ───────────────────────────────────────────
   *
   * Trois moments, trois couples durée/courbe, et JAMAIS la même courbe pour
   * entrer et pour sortir. L'œil suit ce qui arrive et ignore ce qui part :
   * une entrée doit donc être longue et finir doucement, une sortie brève et
   * franche. Avec une seule courbe symétrique pour les deux — ce qu'avait
   * l'habillage — tout avait le même poids, et rien n'avait de direction.
   */
  durEntree: string;
  durSortie: string;
  durGlisse: string;
  easeEntree: string;
  easeSortie: string;
  easeGlisse: string;
  /** Le chevauchement : le nouveau entre quand l'ancien est déjà parti. */
  retardEntree: string;
}

export interface Theme {
  id: string;
  name: string;
  tokens: ThemeTokens;
}

/**
 * La FORME. Commune à tous les habillages : une compétition change les
 * couleurs et le motif de fond, jamais la géométrie. C'est ce qui fait qu'on
 * reconnaît la chaîne sous l'habillage.
 */
const SHAPE = {
  /*
   * Rubik, la police de la marque.
   *
   * Archivo tenait l'antenne jusqu'ici, et c'était un choix par défaut : une
   * grotesque variable, large, sans rapport avec le studio. Rubik a le même
   * aplomb en graisse 900 et des formes plus rondes, qui vont avec le motif
   * d'encre et les angles adoucis de la finition sticker.
   */
  font: '"Rubik", system-ui, -apple-system, sans-serif',
  /*
   * Rubik n'a pas d'axe de chasse. Les deux jetons restent — une quarantaine
   * de règles les emploient — mais ils ne font plus rien. Les retirer
   * demanderait de toucher à tout l'habillage pour un gain nul.
   */
  widthDisplay: '100%',
  widthTight: '100%',
  weightDisplay: '900',

  radiusPanel: '28px',
  radiusCard: '18px',
  radiusChip: '12px',
  radiusPill: '999px',

  s1: '4px',
  s2: '8px',
  s3: '12px',
  s4: '16px',
  s5: '24px',
  s6: '32px',

  /* La finition sticker : une ombre PLEINE, pas un halo diffus. */
  shadow: '0 18px 44px rgba(0, 0, 0, 0.5)',
  shadowSoft: '0 6px 18px rgba(0, 0, 0, 0.32)',

  durFast: '160ms',
  durBase: '320ms',
  durSlow: '620ms',
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',

  durEntree: '520ms',
  durSortie: '220ms',
  durGlisse: '460ms',
  /* Décélération longue : la fin du mouvement est presque immobile. */
  easeEntree: 'cubic-bezier(0.16, 1, 0.3, 1)',
  /* Accélération : on part, on ne traîne pas. */
  easeSortie: 'cubic-bezier(0.55, 0, 1, 0.45)',
  /* Un déplacement n'a ni départ ni arrivée à souligner. */
  easeGlisse: 'cubic-bezier(0.32, 0.72, 0, 1)',
  retardEntree: '140ms',
} as const;

/*
 * ── Les cinq couleurs du studio ─────────────────────────────────────────────
 *
 * Elles ne changent JAMAIS. Un habillage de compétition ne remplace plus le
 * fond, les panneaux ni le texte : il ne colore que l'ACCENT.
 *
 * Pourquoi ce choix : un plateau qui change entièrement de couleurs d'une
 * soirée à l'autre n'appartient à personne — on reconnaît la Ligue des
 * Champions, pas la chaîne. En gardant la nuit, le papier, le motif d'encre
 * et Rubik sur toutes les scènes, c'est le studio qu'on reconnaît d'abord, et
 * la compétition ensuite. C'est aussi la différence entre un habillage à soi
 * et la copie d'un produit existant.
 */
const MARQUE = {
  /** La nuit : le fond, partout. */
  nuit: '#0f1519',
  /** Les cartes et les panneaux, d'un cran plus clair. */
  nuit2: '#16222a',
  teal: '#1e5b57',
  /** Le teal clair : les surtitres, ce qui oriente la lecture. */
  tealClair: '#3fd3c2',
  /** Le miel : l'accent par défaut. UNE seule couleur d'emphase à la fois. */
  miel: '#e0a93b',
  /** Le papier : le texte. Jamais un blanc pur, qui brûle sur la nuit. */
  papier: '#f1ece3',
  /** La brume : le texte secondaire. */
  brume: '#9fb0b3',
} as const;

/**
 * Ce que tous les habillages partagent.
 *
 * Le dégradé de fond reste très sombre et très court : c'est le motif d'encre
 * qui donne la profondeur, pas une lueur colorée.
 */
const BASE = {
  bgDeep: '#121b20',
  bgMid: MARQUE.nuit,
  /** La lueur : du teal très dilué, à peine. */
  glow: 'rgba(30, 91, 87, 0.42)',
  /** Le motif d'encre diluée, la signature. Posé par `encre.css`. */
  pattern: 'var(--encre, none)',
  patternOpacity: '0.14',

  panel: 'rgba(22, 34, 42, 0.94)',
  /** La finition sticker : un contour NUIT, pas un filet clair. */
  panelLine: 'rgba(15, 21, 25, 0.9)',
  panelGlow: '0 0 0 1px rgba(241, 236, 227, 0.07)',
  pill: 'rgba(15, 21, 25, 0.66)',
  pillLine: 'rgba(241, 236, 227, 0.08)',
  slab: 'rgba(241, 236, 227, 0.09)',

  ink: MARQUE.papier,
  inkSoft: MARQUE.brume,
  inkDim: 'rgba(159, 176, 179, 0.6)',

  teal: MARQUE.teal,
  tealClair: MARQUE.tealClair,

  live: '#ff4d4d',
  win: '#3fd3c2',
  lose: '#ef4444',

  pitch: '#17403c',
  pitchStripe: 'rgba(241, 236, 227, 0.05)',
  pitchLine: 'rgba(241, 236, 227, 0.55)',
  ball: MARQUE.miel,
  goalFlood: MARQUE.teal,
} as const;

/**
 * Un habillage ne décide plus que d'une chose : sa couleur d'emphase.
 *
 * Les couleurs retenues sont celles sous lesquelles chaque compétition se
 * présente elle-même, ramenées à une valeur qui tient sur la nuit — un violet
 * de Premier League posé tel quel y disparaîtrait.
 */
function habillage(id: string, name: string, accent: string): Theme {
  return { id, name, tokens: { ...SHAPE, ...BASE, accent } };
}

export const THEMES: Theme[] = [
  habillage('kztv', 'KZ TV', MARQUE.miel),
  habillage('ucl', 'Ligue des Champions', '#4d8dff'),
  habillage('europa', 'Ligue Europa', '#ff8a1f'),
  habillage('conference', 'Ligue Conférence', '#2bd97e'),
  habillage('ligue1', 'Ligue 1', '#5bc2ff'),
  habillage('premier', 'Premier League', '#f0369b'),
  habillage('liga', 'Liga', '#ff5a4d'),
  habillage('seriea', 'Serie A', '#36a9e8'),
  habillage('bundesliga', 'Bundesliga', '#ff3b3b'),
  habillage('coupedefrance', 'Coupe de France', '#7f9cff'),
];


export const DEFAULT_THEME_ID = 'kztv';

export function findTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!;
}

/** `bgDeep` → `--bg-deep`. */
function cssName(key: string): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

export function applyTheme(theme: Theme, root: HTMLElement): void {
  for (const [key, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(cssName(key), value);
  }
  root.dataset.theme = theme.id;
}

export function themeToCss(theme: Theme): string {
  const body = Object.entries(theme.tokens)
    .map(([key, value]) => `  ${cssName(key)}: ${value};`)
    .join('\n');
  return `:root {\n${body}\n}`;
}
