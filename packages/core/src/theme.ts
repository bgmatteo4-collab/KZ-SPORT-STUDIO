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
  font: '"Archivo", system-ui, -apple-system, sans-serif',
  widthDisplay: '96%',
  widthTight: '84%',
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

  shadow: '0 20px 56px rgba(0, 0, 0, 0.48)',
  shadowSoft: '0 6px 20px rgba(0, 0, 0, 0.28)',

  durFast: '160ms',
  durBase: '320ms',
  durSlow: '620ms',
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

const NEUTRAL = {
  ink: '#ffffff',
  inkSoft: 'rgba(196, 206, 238, 0.72)',
  inkDim: 'rgba(196, 206, 238, 0.42)',
  accent: '#e8b45c',
  live: '#ff4d4d',
  win: '#3ddc84',
  lose: '#ef4444',
} as const;

/** Trame de points, façon habillage de chaîne. */
const DOTS =
  'radial-gradient(rgba(255,255,255,0.9) 1.4px, transparent 1.5px)';
/** Diagonales fines. */
const DIAGONALS =
  'repeating-linear-gradient(135deg, rgba(255,255,255,0.9) 0 2px, transparent 2px 22px)';
/** Bandes verticales larges, façon rideau de plateau. */
const CURTAIN =
  'repeating-linear-gradient(90deg, rgba(255,255,255,0.8) 0 3px, transparent 3px 70px)';
/**
 * Chevrons : deux trames croisées en biais.
 *
 * `pattern` finit en `background-image`, qui accepte une LISTE séparée par des
 * virgules — on superpose donc deux dégradés répétés sans ajouter de couche au
 * document. Plus anguleux que les diagonales, pour les compétitions qui ont du
 * tranchant.
 */
const CHEVRONS =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.9) 0 2px, transparent 2px 26px),' +
  ' repeating-linear-gradient(-45deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 26px)';
/** Grille fine : la rigueur d'un tableau, pour les championnats. */
const GRILLE =
  'repeating-linear-gradient(0deg, rgba(255,255,255,0.8) 0 1px, transparent 1px 34px),' +
  ' repeating-linear-gradient(90deg, rgba(255,255,255,0.8) 0 1px, transparent 1px 34px)';

export const THEMES: Theme[] = [
  {
    id: 'kztv',
    name: 'KZ TV',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#2a1a63',
      bgMid: '#141a4e',
      glow: 'rgba(124, 92, 255, 0.40)',
      pattern: DOTS,
      patternOpacity: '0.05',
      panel: 'rgba(13, 17, 50, 0.93)',
      panelLine: 'rgba(150, 128, 255, 0.58)',
      panelGlow: '0 0 0 1px rgba(150,128,255,0.18), 0 0 26px rgba(124,92,255,0.22)',
      pill: 'rgba(41, 48, 110, 0.78)',
      pillLine: 'rgba(255, 255, 255, 0.08)',
      slab: 'rgba(255, 255, 255, 0.10)',
      pitch: '#2440c8',
      pitchStripe: 'rgba(255, 255, 255, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.62)',
      ball: '#ffc93c',
      goalFlood: '#b4209b',
    },
  },
  {
    id: 'ucl',
    name: 'Ligue des Champions',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#0d1b5c',
      bgMid: '#061034',
      glow: 'rgba(66, 153, 255, 0.38)',
      pattern: DOTS,
      patternOpacity: '0.06',
      panel: 'rgba(8, 16, 54, 0.94)',
      panelLine: 'rgba(96, 170, 255, 0.62)',
      panelGlow: '0 0 0 1px rgba(96,170,255,0.18), 0 0 26px rgba(66,153,255,0.26)',
      pill: 'rgba(22, 42, 108, 0.80)',
      pillLine: 'rgba(120, 170, 255, 0.14)',
      slab: 'rgba(130, 180, 255, 0.14)',
      accent: '#7fd0ff',
      pitch: '#1639b8',
      pitchStripe: 'rgba(255, 255, 255, 0.075)',
      pitchLine: 'rgba(255, 255, 255, 0.64)',
      ball: '#ffd24a',
      goalFlood: '#7b2fd0',
    },
  },
  {
    id: 'ligue1',
    name: 'Ligue 1',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#111a3d',
      bgMid: '#070b1d',
      glow: 'rgba(217, 255, 60, 0.20)',
      pattern: DIAGONALS,
      patternOpacity: '0.05',
      panel: 'rgba(11, 16, 40, 0.94)',
      panelLine: 'rgba(217, 255, 60, 0.46)',
      panelGlow: '0 0 0 1px rgba(217,255,60,0.14), 0 0 24px rgba(217,255,60,0.16)',
      pill: 'rgba(24, 34, 74, 0.82)',
      pillLine: 'rgba(255, 255, 255, 0.08)',
      slab: 'rgba(217, 255, 60, 0.14)',
      accent: '#d9ff3c',
      pitch: '#15327e',
      pitchStripe: 'rgba(217, 255, 60, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.6)',
      ball: '#d9ff3c',
      goalFlood: '#0b4f9e',
    },
  },
  {
    id: 'premier',
    name: 'Premier League',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#3d0a52',
      bgMid: '#1a0430',
      glow: 'rgba(0, 255, 135, 0.22)',
      pattern: CURTAIN,
      patternOpacity: '0.045',
      panel: 'rgba(27, 8, 50, 0.94)',
      panelLine: 'rgba(0, 255, 135, 0.46)',
      panelGlow: '0 0 0 1px rgba(0,255,135,0.14), 0 0 24px rgba(0,255,135,0.18)',
      pill: 'rgba(60, 16, 96, 0.80)',
      pillLine: 'rgba(255, 255, 255, 0.09)',
      slab: 'rgba(0, 255, 135, 0.14)',
      accent: '#00ff87',
      pitch: '#4a1370',
      pitchStripe: 'rgba(255, 255, 255, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.62)',
      ball: '#00ff87',
      goalFlood: '#c2185b',
    },
  },

  // ── Les coupes d'Europe ────────────────────────────────────────────────────
  //
  // Chacune a une identité que le spectateur reconnaît avant de lire le nom :
  // le bleu nuit de la Ligue des Champions, l'orange de l'Europa, le vert de la
  // Conférence. On ne copie pas les chartes — on en prend la LUMIÈRE, qui est
  // ce qu'on reconnaît à l'antenne.

  {
    id: 'europa',
    name: 'Ligue Europa',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#49230a',
      bgMid: '#140a04',
      glow: 'rgba(255, 138, 31, 0.30)',
      pattern: CHEVRONS,
      patternOpacity: '0.05',
      panel: 'rgba(28, 16, 8, 0.94)',
      panelLine: 'rgba(255, 160, 70, 0.52)',
      panelGlow: '0 0 0 1px rgba(255,160,70,0.16), 0 0 26px rgba(255,138,31,0.22)',
      pill: 'rgba(74, 42, 18, 0.80)',
      pillLine: 'rgba(255, 180, 110, 0.14)',
      slab: 'rgba(255, 190, 130, 0.14)',
      accent: '#ff9b35',
      pitch: '#8f4409',
      pitchStripe: 'rgba(255, 255, 255, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.60)',
      ball: '#ffd24a',
      goalFlood: '#ff6a00',
    },
  },
  {
    id: 'conference',
    name: 'Ligue Conférence',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#07402c',
      bgMid: '#021410',
      glow: 'rgba(47, 224, 138, 0.26)',
      pattern: DOTS,
      patternOpacity: '0.055',
      panel: 'rgba(6, 26, 20, 0.94)',
      panelLine: 'rgba(60, 230, 150, 0.48)',
      panelGlow: '0 0 0 1px rgba(60,230,150,0.15), 0 0 24px rgba(47,224,138,0.20)',
      pill: 'rgba(12, 58, 42, 0.80)',
      pillLine: 'rgba(140, 255, 200, 0.12)',
      slab: 'rgba(120, 255, 190, 0.13)',
      accent: '#2fe08a',
      pitch: '#0b6a48',
      pitchStripe: 'rgba(255, 255, 255, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.60)',
      ball: '#eaffb0',
      goalFlood: '#00c46a',
    },
  },

  // ── Les championnats ───────────────────────────────────────────────────────

  {
    id: 'liga',
    name: 'Liga',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#16285f',
      bgMid: '#060c22',
      glow: 'rgba(255, 107, 90, 0.26)',
      pattern: DIAGONALS,
      patternOpacity: '0.05',
      panel: 'rgba(9, 16, 42, 0.94)',
      panelLine: 'rgba(255, 130, 110, 0.46)',
      panelGlow: '0 0 0 1px rgba(255,130,110,0.15), 0 0 24px rgba(255,107,90,0.20)',
      pill: 'rgba(28, 44, 96, 0.80)',
      pillLine: 'rgba(255, 170, 150, 0.12)',
      slab: 'rgba(255, 160, 140, 0.14)',
      accent: '#ff6b5a',
      pitch: '#1c3a94',
      pitchStripe: 'rgba(255, 255, 255, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.62)',
      ball: '#ffd24a',
      goalFlood: '#ff4a3c',
    },
  },
  {
    id: 'seriea',
    name: 'Serie A',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#063a7e',
      bgMid: '#020b1c',
      glow: 'rgba(73, 184, 255, 0.28)',
      pattern: GRILLE,
      patternOpacity: '0.05',
      panel: 'rgba(5, 18, 40, 0.94)',
      panelLine: 'rgba(90, 190, 255, 0.50)',
      panelGlow: '0 0 0 1px rgba(90,190,255,0.16), 0 0 24px rgba(73,184,255,0.20)',
      pill: 'rgba(12, 48, 96, 0.80)',
      pillLine: 'rgba(150, 210, 255, 0.13)',
      slab: 'rgba(140, 205, 255, 0.14)',
      accent: '#49b8ff',
      pitch: '#0a4e9e',
      pitchStripe: 'rgba(255, 255, 255, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.62)',
      ball: '#ffffff',
      goalFlood: '#0a84ff',
    },
  },
  {
    id: 'bundesliga',
    name: 'Bundesliga',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#400b12',
      bgMid: '#0d0507',
      glow: 'rgba(255, 59, 74, 0.26)',
      pattern: CHEVRONS,
      patternOpacity: '0.045',
      panel: 'rgba(22, 8, 11, 0.94)',
      panelLine: 'rgba(255, 90, 100, 0.48)',
      panelGlow: '0 0 0 1px rgba(255,90,100,0.15), 0 0 24px rgba(255,59,74,0.20)',
      pill: 'rgba(62, 18, 24, 0.80)',
      pillLine: 'rgba(255, 150, 160, 0.12)',
      slab: 'rgba(255, 140, 150, 0.13)',
      accent: '#ff3b4a',
      pitch: '#8c1420',
      pitchStripe: 'rgba(255, 255, 255, 0.07)',
      pitchLine: 'rgba(255, 255, 255, 0.60)',
      ball: '#ffffff',
      goalFlood: '#e2001a',
    },
  },

  // ── Les coupes nationales ──────────────────────────────────────────────────

  {
    id: 'coupedefrance',
    name: 'Coupe de France',
    tokens: {
      ...SHAPE,
      ...NEUTRAL,
      bgDeep: '#0d2f78',
      bgMid: '#04102c',
      glow: 'rgba(255, 77, 90, 0.24)',
      // Le rideau vertical : une coupe, c'est un soir de gala.
      pattern: CURTAIN,
      patternOpacity: '0.05',
      panel: 'rgba(7, 18, 46, 0.94)',
      panelLine: 'rgba(255, 110, 120, 0.44)',
      panelGlow: '0 0 0 1px rgba(255,110,120,0.14), 0 0 24px rgba(255,77,90,0.18)',
      pill: 'rgba(20, 48, 108, 0.80)',
      pillLine: 'rgba(255, 255, 255, 0.10)',
      slab: 'rgba(255, 255, 255, 0.12)',
      accent: '#ff4d5a',
      pitch: '#14409c',
      pitchStripe: 'rgba(255, 255, 255, 0.075)',
      pitchLine: 'rgba(255, 255, 255, 0.66)',
      ball: '#ffffff',
      goalFlood: '#ef3340',
    },
  },
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
