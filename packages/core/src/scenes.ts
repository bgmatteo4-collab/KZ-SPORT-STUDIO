/**
 * Le compositeur de scènes.
 *
 * Une collection de widgets flottants ne devient jamais un produit. Ce qui en
 * fait un, c'est qu'une SCÈNE décide de tout d'un coup : quels widgets, où, et
 * surtout OÙ VA LA WEBCAM.
 *
 * ── L'architecture à deux flux ────────────────────────────────────────────────
 *
 *   OBS, de haut en bas :
 *     Source navigateur  ?layer=fg   couches de z > CAM_Z   (devant toi)
 *     Ta webcam                      ← pilotée par `Scene.cam`
 *     Source navigateur  ?layer=bg   couches de z < CAM_Z   (derrière toi)
 *
 * Et rien en dessous : on ne diffuse jamais les images du match.
 *
 * Quand la régie commute une scène, les deux overlays animent leurs couches et
 * la régie envoie le rectangle `cam` à OBS, qui anime TA VRAIE webcam — avec tes
 * filtres et ta correction couleur — sur la même durée et la même courbe.
 * L'overlay `fg` dessine le cadre et l'ombre autour.
 */

/** Rectangle normalisé sur [0,1]. Indépendant de la résolution de sortie. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La webcam vit exactement sur cette profondeur. Elle coupe le monde en deux. */
export const CAM_Z = 100;

export const CANVAS = { w: 1920, h: 1080 } as const;

export type CamStyle = 'full' | 'rounded' | 'circle' | 'framed';

export type TransitionKind = 'cut' | 'fade' | 'slide' | 'wipe';

export interface SceneLayer {
  /** Clé dans le registre des widgets. */
  widget: string;
  slot: Rect;
  z: number;
  opts?: Record<string, unknown>;
}

export interface Scene {
  id: string;
  name: string;
  /** Rectangle cible de la webcam. `null` = caméra masquée sur cette scène. */
  cam: Rect | null;
  camStyle: CamStyle;
  layers: SceneLayer[];
  /**
   * Le créneau où la régie automatique glisse ses inserts.
   *
   * Pendant le match, le panneau qui occupe ce créneau cède temporairement la
   * place aux statistiques, au classement ou au momentum — comme un
   * réalisateur télé insère une carte puis rend l'antenne. `undefined` : la
   * scène ne reçoit aucun insert.
   */
  insertSlot?: Rect;
  transition: { kind: TransitionKind; ms: number };
}

export type OverlayLayer = 'bg' | 'fg';

/** Les couches qui reviennent à une source navigateur donnée. */
export function layersFor(scene: Scene, layer: OverlayLayer): SceneLayer[] {
  return scene.layers
    .filter((l) => (layer === 'bg' ? l.z < CAM_Z : l.z > CAM_Z))
    .sort((a, b) => a.z - b.z);
}

export function rectToPixels(rect: Rect): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round(rect.x * CANVAS.w),
    y: Math.round(rect.y * CANVAS.h),
    w: Math.round(rect.w * CANVAS.w),
    h: Math.round(rect.h * CANVAS.h),
  };
}

// ────────────────────────────── La grille du plateau ─────────────────────────
// Mesurée sur le produit de référence en fonctionnement. Normalisée sur [0,1],
// donc indépendante de la résolution. Déplacer un panneau se fait ICI, pas dans
// douze scènes. Voir docs/HABILLAGE.md pour le schéma.

const SLOT = {
  /** Toute la surface : fond habillé, cartons plein écran. */
  plein: { x: 0, y: 0, w: 1, h: 1 },

  /** La bannière de score : écus compris, donc d'un bord à l'autre. */
  banniere: { x: 0.008, y: 0.01, w: 0.984, h: 0.142 },

  /** Colonne de gauche : multiplex, stats, avant-match ou classement. */
  colonneGauche: { x: 0.008, y: 0.172, w: 0.236, h: 0.715 },
  /** Vues et likes, sous la colonne de gauche. */
  compteurs: { x: 0.008, y: 0.902, w: 0.236, h: 0.058 },

  /** La case centrale : la caméra. Jamais les images du match. */
  caseCentrale: { x: 0.258, y: 0.158, w: 0.484, h: 0.472 },
  /** Le radar, sous la case centrale. */
  radar: { x: 0.272, y: 0.648, w: 0.456, h: 0.322 },

  /** Colonne de droite, haut : compositions. */
  colonneDroite: { x: 0.746, y: 0.172, w: 0.246, h: 0.478 },
  /** Colonne de droite, bas : cotes. */
  colonneDroiteBas: { x: 0.746, y: 0.668, w: 0.246, h: 0.19 },
  /** Pseudo social, tout en bas à droite. */
  social: { x: 0.746, y: 0.878, w: 0.246, h: 0.062 },

  /**
   * Scènes plein écran. Un panneau seul au milieu d'un fond vide ne fait pas
   * un plateau : on compose toujours un grand panneau et deux cellules à
   * droite, dont la dernière accueille la caméra.
   */
  pleinPrincipal: { x: 0.012, y: 0.172, w: 0.598, h: 0.8 },
  pleinSecondaire: { x: 0.622, y: 0.172, w: 0.366, h: 0.468 },
  pleinTertiaire: { x: 0.622, y: 0.655, w: 0.366, h: 0.317 },

  /** Deux panneaux à parité : les compositions des deux équipes. */
  moitieGauche: { x: 0.012, y: 0.172, w: 0.483, h: 0.8 },
  moitieDroite: { x: 0.505, y: 0.172, w: 0.483, h: 0.8 },

  /** Bandeau de titre, sous la caméra des scènes d'attente et de débrief. */
  titreCentre: { x: 0.18, y: 0.72, w: 0.64, h: 0.18 },
} as const satisfies Record<string, Rect>;

// Les emplacements de la caméra. Elle est LOGÉE dans le plateau, jamais posée
// dessus : c'est ce qui distingue un habillage de télévision d'un bandeau.
//
// DÉCISION VERROUILLÉE : la case centrale est TOUJOURS la caméra. On ne
// diffuse jamais les images du match — c'est la raison d'être d'un watchalong,
// et la seule façon de rester dans les clous des droits de diffusion. Le
// plateau raconte le match par la donnée : score, radar, stats, compositions.
const CAM = {
  /** La case centrale du plateau : la position de match. */
  case: SLOT.caseCentrale,
  /** La case centrale prolongée jusqu'en bas : l'animateur avant le coup d'envoi. */
  centreHaut: { x: 0.258, y: 0.158, w: 0.484, h: 0.812 },
  /** Plein cadre, pour le commentaire sans habillage lourd. */
  plein: { x: 0, y: 0, w: 1, h: 1 },
  /** Grande, centrée haut : attente et débrief. */
  grande: { x: 0.265, y: 0.13, w: 0.47, h: 0.56 },
  /** La cellule basse droite des scènes plein écran. */
  coin: { x: 0.622, y: 0.655, w: 0.366, h: 0.317 },
  /** Deux invités côte à côte dans la case centrale. */
  duoGauche: { x: 0.258, y: 0.158, w: 0.238, h: 0.472 },
} as const satisfies Record<string, Rect>;

const CUT = { kind: 'cut', ms: 0 } as const;
const FADE = { kind: 'fade', ms: 320 } as const;
const SLIDE = { kind: 'slide', ms: 420 } as const;

/**
 * Le catalogue. Une scène = une entrée ici, pas une ligne de logique.
 *
 * Les panneaux latéraux sont PERMANENTS pendant le match : ce sont leurs
 * contenus qui changent d'une scène à l'autre. C'est ce qui donne la sensation
 * de plateau plutôt que de diaporama.
 */
export const SCENES: Scene[] = [
  {
    id: 'avant-match',
    name: 'Avant-match',
    cam: CAM.centreHaut,
    camStyle: 'framed',
    transition: SLIDE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'prematch', slot: SLOT.colonneGauche, z: 20 },
      { widget: 'stream-counters', slot: SLOT.compteurs, z: 20 },
      { widget: 'lineups', slot: SLOT.colonneDroite, z: 20 },
      { widget: 'odds', slot: SLOT.colonneDroiteBas, z: 20 },
      { widget: 'social', slot: SLOT.social, z: 20 },
      { widget: 'cam-frame', slot: CAM.centreHaut, z: 110 },
    ],
  },
  {
    id: 'match',
    name: 'Match',
    cam: CAM.case,
    camStyle: 'framed',
    // Le multiplex tient la colonne de gauche, et la cède aux inserts de la
    // régie automatique : statistiques, classement, momentum.
    insertSlot: SLOT.colonneGauche,
    transition: SLIDE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'multiplex', slot: SLOT.colonneGauche, z: 20 },
      { widget: 'stream-counters', slot: SLOT.compteurs, z: 20 },
      { widget: 'radar2d', slot: SLOT.radar, z: 20 },
      { widget: 'lineups', slot: SLOT.colonneDroite, z: 20 },
      { widget: 'odds', slot: SLOT.colonneDroiteBas, z: 20 },
      { widget: 'social', slot: SLOT.social, z: 20 },
      { widget: 'cam-frame', slot: CAM.case, z: 110 },
    ],
  },
  {
    id: 'plein-cadre',
    name: 'Plein cadre',
    cam: CAM.plein,
    camStyle: 'full',
    transition: FADE,
    layers: [{ widget: 'score-banner', slot: SLOT.banniere, z: 120 }],
  },
  {
    id: 'compos',
    name: 'Compositions',
    cam: null,
    camStyle: 'full',
    transition: FADE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'lineups', slot: SLOT.moitieGauche, z: 20, opts: { side: 'home', large: true } },
      { widget: 'lineups-away', slot: SLOT.moitieDroite, z: 20, opts: { side: 'away', large: true } },
    ],
  },
  {
    id: 'radar-plein',
    name: 'Radar plein écran',
    cam: CAM.coin,
    camStyle: 'framed',
    transition: FADE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'radar2d', slot: SLOT.pleinPrincipal, z: 20, opts: { large: true } },
      { widget: 'stats', slot: SLOT.pleinSecondaire, z: 20 },
      { widget: 'social', slot: SLOT.social, z: 20 },
      { widget: 'cam-frame', slot: CAM.coin, z: 110 },
    ],
  },
  {
    id: 'multiplex',
    name: 'Multiplex',
    cam: CAM.coin,
    camStyle: 'framed',
    transition: FADE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'multiplex', slot: SLOT.pleinPrincipal, z: 20, opts: { large: true } },
      { widget: 'standings', slot: SLOT.pleinSecondaire, z: 20 },
      { widget: 'social', slot: SLOT.social, z: 20 },
      { widget: 'cam-frame', slot: CAM.coin, z: 110 },
    ],
  },
  {
    id: 'feuille',
    name: 'Feuille de match',
    cam: CAM.coin,
    camStyle: 'framed',
    transition: FADE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'sheet', slot: SLOT.pleinPrincipal, z: 20 },
      { widget: 'momentum', slot: SLOT.pleinSecondaire, z: 20 },
      { widget: 'social', slot: SLOT.social, z: 20 },
      { widget: 'cam-frame', slot: CAM.coin, z: 110 },
    ],
  },
  {
    id: 'pause',
    name: 'Pause',
    cam: null,
    camStyle: 'full',
    transition: FADE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'multiplex', slot: SLOT.colonneGauche, z: 20 },
      { widget: 'standings', slot: SLOT.colonneDroite, z: 20 },
      { widget: 'stream-counters', slot: SLOT.compteurs, z: 20 },
      { widget: 'title', slot: SLOT.titreCentre, z: 120, opts: { text: 'Pause' } },
      { widget: 'social', slot: SLOT.social, z: 20 },
    ],
  },
];

export const DEFAULT_SCENE_ID = 'match';

export function findScene(id: string): Scene {
  return SCENES.find((s) => s.id === id) ?? SCENES.find((s) => s.id === DEFAULT_SCENE_ID)!;
}

export { SLOT, CAM };
