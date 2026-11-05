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
      panel: 'rgba(14, 18, 54, 0.80)',
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
      panel: 'rgba(7, 15, 56, 0.82)',
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
      panel: 'rgba(10, 15, 38, 0.84)',
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
      panel: 'rgba(26, 6, 48, 0.82)',
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
