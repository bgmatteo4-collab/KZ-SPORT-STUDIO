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

/**
 * Le MOMENT d'émission, à l'intérieur d'une même scène.
 *
 * ── Pourquoi un mode plutôt que quatre scènes ───────────────────────────────
 *
 * Avant le coup d'envoi, à la mi-temps et au coup de sifflet final, on regarde
 * le même match depuis le même plateau. Ce qui change, ce n'est pas la
 * disposition — c'est ce qu'on a à dire. Des cotes avant, des statistiques à la
 * pause, le classement à l'arrivée.
 *
 * En faire quatre scènes séparées obligerait l'opérateur à retenir quatre
 * boutons qui donnent presque la même image, et à se tromper en direct. Un mode
 * garde une seule scène « Match » et remplace son CONTENU.
 */
export type SceneMode = 'avant' | 'direct' | 'mi-temps' | 'fin';

export const SCENE_MODES: { id: SceneMode; nom: string; court: string }[] = [
  { id: 'avant', nom: 'Avant-match', court: 'Avant' },
  { id: 'direct', nom: 'Direct', court: 'Direct' },
  { id: 'mi-temps', nom: 'Mi-temps', court: 'Mi-temps' },
  { id: 'fin', nom: 'Fin de match', court: 'Fin' },
];

export const DEFAULT_SCENE_MODE: SceneMode = 'direct';

export interface Scene {
  id: string;
  name: string;
  /** Rectangle cible de la webcam. `null` = caméra masquée sur cette scène. */
  cam: Rect | null;
  camStyle: CamStyle;
  /** Les couches par défaut, et celles des scènes qui ignorent le mode. */
  layers: SceneLayer[];
  /**
   * Les variantes par moment d'émission. Une scène sans `modes` affiche
   * `layers` quel que soit le mode — c'est le cas de la plupart.
   */
  modes?: Partial<Record<SceneMode, SceneLayer[]>>;
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

/**
 * `bg` et `fg` sont les deux sources d'OBS, avec la caméra en sandwich.
 * `all` rend tout dans un seul document : c'est ce qu'il faut pour un MONITEUR,
 * qui n'a pas à imiter l'empilement — et qui épargne ainsi une instance de
 * navigateur complète.
 */
export type OverlayLayer = 'bg' | 'fg' | 'all';

/** Les couches qui reviennent à une source navigateur donnée. */
export function layersFor(scene: Scene, layer: OverlayLayer, mode?: SceneMode): SceneLayer[] {
  // Une scène qui ne déclare pas ce mode garde ses couches par défaut : le mode
  // ne doit jamais vider un plateau par surprise.
  const couches = (mode && scene.modes?.[mode]) ?? scene.layers;
  return couches
    .filter((l) => (layer === 'all' ? true : layer === 'bg' ? l.z < CAM_Z : l.z > CAM_Z))
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
  /** La colonne droite d'un seul tenant, quand un panneau mérite toute la hauteur. */
  colonneDroiteTout: { x: 0.746, y: 0.172, w: 0.246, h: 0.686 },
  /*
   * ── Le bloc réseaux ─────────────────────────────────────────────────────
   *
   * Il avait UNE place, la même partout, et c'était un défaut : sur les
   * scènes plein écran la caméra occupe le coin bas droit, donc le bandeau
   * s'y retrouvait DERRIÈRE elle. Comme il vit en z = 20 et la caméra en
   * z = 100, il n'écrasait rien — il disparaissait simplement, sans que rien
   * ne le signale. Sur la scène de pause, il mordait sur le bandeau de
   * titre de soixante-quatorze pixels.
   *
   * Trois places, donc, choisies par la scène selon ce qu'elle occupe. Le
   * bloc garde la même forme et la même rotation : ce n'est pas l'objet qui
   * change, c'est l'endroit où il tient.
   */
  /** Sous la colonne de droite, quand la caméra est au centre. */
  social: { x: 0.746, y: 0.878, w: 0.246, h: 0.062 },
  /** Juste au-dessus de la caméra de coin : le bandeau de chaîne à côté de
   *  l'animateur, comme un nom de présentateur à la télévision. */
  socialSurCam: { x: 0.622, y: 0.578, w: 0.366, h: 0.062 },
  /** Centré tout en bas, sur les scènes à deux moitiés et sans caméra. */
  socialCentre: { x: 0.356, y: 0.916, w: 0.288, h: 0.056 },

  /**
   * Scènes plein écran. Un panneau seul au milieu d'un fond vide ne fait pas
   * un plateau : on compose toujours un grand panneau et deux cellules à
   * droite, dont la dernière accueille la caméra.
   */
  pleinPrincipal: { x: 0.012, y: 0.172, w: 0.598, h: 0.8 },
  /* Raccourci de sept centièmes pour loger le bandeau réseaux entre ce
     panneau et la caméra de coin. Ça coûte une ligne de classement ; un
     bandeau de chaîne invisible coûtait tout le bandeau. */
  pleinSecondaire: { x: 0.622, y: 0.172, w: 0.366, h: 0.396 },
  pleinTertiaire: { x: 0.622, y: 0.655, w: 0.366, h: 0.317 },

  /** Deux panneaux à parité : les compositions des deux équipes. */
  moitieGauche: { x: 0.012, y: 0.172, w: 0.483, h: 0.73 },
  moitieDroite: { x: 0.505, y: 0.172, w: 0.483, h: 0.73 },

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

// ───────────────────────── Les quatre moments du match ───────────────────────
//
// Le décor est COMMUN aux quatre : même bannière, même cadre caméra, même
// place pour les compteurs. Ce qui change, ce sont les trois panneaux — et
// c'est exactement ce qu'on veut, parce qu'un spectateur ne doit pas avoir
// l'impression de changer de chaîne entre l'avant-match et le coup d'envoi.

const CHROME_MATCH: SceneLayer[] = [
  { widget: 'backdrop', slot: SLOT.plein, z: 10 },
  { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
  { widget: 'stream-counters', slot: SLOT.compteurs, z: 20 },
  { widget: 'social', slot: SLOT.social, z: 20 },
  { widget: 'cam-frame', slot: CAM.case, z: 110 },
];

/** Avant le coup d'envoi : l'affiche, les forces en présence, le contexte. */
const MATCH_AVANT: SceneLayer[] = [
  ...CHROME_MATCH,
  { widget: 'prematch', slot: SLOT.colonneGauche, z: 20 },
  // Le classement AVANT la rencontre : c'est le sens du match qu'on va voir.
  { widget: 'standings', slot: SLOT.radar, z: 20 },
  { widget: 'lineups', slot: SLOT.colonneDroite, z: 20, opts: { probable: true } },
  { widget: 'odds', slot: SLOT.colonneDroiteBas, z: 20 },
];

/**
 * Le jeu.
 *
 * La colonne de gauche est CONSACRÉE au match qu'on commente : ses
 * statistiques, rien d'autre. Le bandeau large du bas porte les autres
 * rencontres en cours — c'est la place d'un multiplex à la télévision, en bas
 * de l'écran, et non dans une colonne qui vole la vedette au match principal.
 *
 * Le momentum n'a plus sa place ici : il raconte ce qui S'EST PASSÉ, donc il
 * appartient aux moments où l'on analyse — la mi-temps et la fin. Il revient
 * en insert quand la régie automatique le juge motivé.
 *
 * Les cotes ont quitté le direct, et c'est une décision éditoriale, pas un
 * oubli : aucune source gratuite ne donne de cote VIVANTE. Afficher un 1N2
 * d'avant-match à la 70e minute d'un 3-0 ne dit pas « voilà la probabilité »,
 * ça dit quelque chose de faux. Leur place est l'avant-match, où elles sont
 * exactes. Le créneau libéré va au fil des derniers faits — ce qui vient de
 * se passer, soit exactement ce qu'un spectateur qui arrive veut savoir.
 */
const MATCH_DIRECT: SceneLayer[] = [
  ...CHROME_MATCH,
  // La colonne entière pour les statistiques : autant les donner toutes.
  { widget: 'stats', slot: SLOT.colonneGauche, z: 20, opts: { large: true } },
  { widget: 'multiplex', slot: SLOT.radar, z: 20, opts: { large: true } },
  // La composition ALTERNE entre les deux équipes : le panneau montrait
  // celle de l'équipe à domicile pendant quatre-vingt-dix minutes, et la
  // moitié du match n'apparaissait nulle part sur le plateau.
  { widget: 'lineups', slot: SLOT.colonneDroite, z: 20, opts: { alterne: true } },
  { widget: 'fil-recent', slot: SLOT.colonneDroiteBas, z: 20, opts: { recent: true } },
];

/**
 * La pause : on analyse.
 *
 * Le bandeau large du bas passe au FIL de la période écoulée, en deux
 * colonnes. C'est le moment où l'on raconte — « deux occasions coup sur coup
 * à la 20e, puis plus rien » — et une liste de faits dit ça infiniment mieux
 * qu'un tableau. La courbe de momentum l'accompagne, à sa droite : l'une
 * montre la forme du match, l'autre ce qui l'a produite.
 */
const MATCH_MI_TEMPS: SceneLayer[] = [
  ...CHROME_MATCH,
  // La colonne est la même qu'en direct : autant donner les mêmes chiffres.
  // C'est à la pause qu'on commente les corners, les fautes et les cartons.
  { widget: 'stats', slot: SLOT.colonneGauche, z: 20, opts: { large: true } },
  { widget: 'fil', slot: SLOT.radar, z: 20, opts: { large: true } },
  // Le momentum prend la grande case : une courbe écrasée dans deux cents
  // pixels de haut n'est plus qu'un trait, et il ne resterait que deux
  // pourcentages — qu'une barre dirait aussi bien. Le multiplex, lui, est une
  // liste : il se contente de la petite case en montrant moins de matchs.
  { widget: 'momentum', slot: SLOT.colonneDroite, z: 20 },
  { widget: 'multiplex', slot: SLOT.colonneDroiteBas, z: 20 },
];

/** Au coup de sifflet : le bilan, et ce que ça change au classement. */
const MATCH_FIN: SceneLayer[] = [
  ...CHROME_MATCH,
  { widget: 'stats', slot: SLOT.colonneGauche, z: 20, opts: { large: true } },
  { widget: 'momentum', slot: SLOT.radar, z: 20 },
  // Plus de cotes à l'arrivée : elles ne veulent plus rien dire. La colonne
  // droite passe d'un seul tenant au classement, qui vient de bouger.
  { widget: 'standings', slot: SLOT.colonneDroiteTout, z: 20 },
];

/**
 * Le catalogue. Une scène = une entrée ici, pas une ligne de logique.
 *
 * Les panneaux latéraux sont PERMANENTS pendant le match : ce sont leurs
 * contenus qui changent d'une scène à l'autre. C'est ce qui donne la sensation
 * de plateau plutôt que de diaporama.
 */
export const SCENES: Scene[] = [
  {
    // L'ÉCRAN D'ATTENTE. Les dix minutes avant le coup d'envoi sont les plus
    // importantes d'un watchalong : les gens arrivent, le streamer parle. Un
    // tableau de bord rempli de zéros dirait que le match est commencé et nul.
    //
    // D'où une composition symétrique, en affiche plutôt qu'en tableau : les
    // deux compositions probables se font face, et entre elles, sous la
    // caméra, le compte à rebours.
    id: 'avant-match',
    name: 'Avant-match',
    cam: CAM.case,
    camStyle: 'framed',
    transition: SLIDE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      {
        widget: 'lineups',
        slot: SLOT.colonneGauche,
        z: 20,
        opts: { side: 'home', probable: true },
      },
      { widget: 'attente', slot: SLOT.radar, z: 20 },
      {
        widget: 'lineups-away',
        slot: SLOT.colonneDroiteTout,
        z: 20,
        opts: { side: 'away', probable: true },
      },
      { widget: 'stream-counters', slot: SLOT.compteurs, z: 20 },
      { widget: 'social', slot: SLOT.social, z: 20 },
      { widget: 'cam-frame', slot: CAM.case, z: 110 },
    ],
  },
  {
    id: 'match',
    name: 'Match',
    cam: CAM.case,
    camStyle: 'framed',
    // Les inserts prennent le bandeau du bas, pas la colonne de gauche : celle-ci
    // est consacrée aux statistiques du match et ne doit pas être volée. C'est
    // donc le multiplex qui cède sa place quelques secondes, comme une carte
    // qu'un réalisateur insère avant de rendre l'antenne.
    insertSlot: SLOT.radar,
    transition: SLIDE,
    // Le plateau ne bouge pas d'un mode à l'autre — seul son CONTENU change.
    // La caméra reste au même endroit, les cadres aussi : l'opérateur passe de
    // l'avant-match au direct sans que le spectateur voie un changement de
    // décor, uniquement un changement de propos.
    layers: MATCH_DIRECT,
    modes: {
      avant: MATCH_AVANT,
      direct: MATCH_DIRECT,
      'mi-temps': MATCH_MI_TEMPS,
      fin: MATCH_FIN,
    },
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
      // Centré sous les deux compositions : c'est la seule bande libre, et
      // c'est aussi la plus naturelle sur une scène symétrique.
      { widget: 'social', slot: SLOT.socialCentre, z: 20 },
    ],
  },
  {
    // Le radar plein écran a disparu : aucune source gratuite ne donne la
    // position du ballon, et un terrain vide en grand ne dit rien. Le
    // classement, lui, est ce qu'on commente vraiment entre deux actions.
    id: 'classement',
    name: 'Classement',
    cam: CAM.coin,
    camStyle: 'framed',
    transition: FADE,
    layers: [
      { widget: 'backdrop', slot: SLOT.plein, z: 10 },
      { widget: 'score-banner', slot: SLOT.banniere, z: 120 },
      { widget: 'standings', slot: SLOT.pleinPrincipal, z: 20, opts: { large: true } },
      // Les autres résultats de la soirée : ce sont EUX qui font bouger le
      // tableau qu'on est en train de regarder.
      { widget: 'multiplex', slot: SLOT.pleinSecondaire, z: 20 },
      // Au-dessus de la caméra de coin, pas sous elle : à l'ancienne place
      // le bandeau passait derrière l'image et disparaissait.
      { widget: 'social', slot: SLOT.socialSurCam, z: 20 },
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
      // Plein écran, le multiplex GROUPE par compétition : vingt lignes de dix
      // championnats différents ne se lisent plus, parce qu'on ne sait plus
      // si « 2-1 » est un match de Ligue 1 ou de troisième division.
      { widget: 'multiplex', slot: SLOT.pleinPrincipal, z: 20, opts: { large: true, groupe: true } },
      { widget: 'standings', slot: SLOT.pleinSecondaire, z: 20 },
      // Au-dessus de la caméra de coin, pas sous elle : à l'ancienne place
      // le bandeau passait derrière l'image et disparaissait.
      { widget: 'social', slot: SLOT.socialSurCam, z: 20 },
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
      // Au-dessus de la caméra de coin, pas sous elle : à l'ancienne place
      // le bandeau passait derrière l'image et disparaissait.
      { widget: 'social', slot: SLOT.socialSurCam, z: 20 },
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
      // Le bandeau de titre descend jusqu'à 0,9 : à l'ancienne place, le bloc
      // réseaux lui mordait dessus sur soixante-quatorze pixels.
      { widget: 'social', slot: SLOT.socialCentre, z: 20 },
    ],
  },
];

/**
 * Le nom lisible de chaque widget.
 *
 * Les scènes désignent leurs couches par une CLÉ de registre — « score-banner »,
 * « fil-recent ». C'est ce qu'il faut pour le code, et c'est illisible pour un
 * opérateur qui veut savoir ce que contient la scène qu'il va envoyer. La
 * table vit ici, avec les scènes qui s'en servent.
 */
export const NOM_WIDGET: Record<string, string> = {
  backdrop: 'Fond habillé',
  'score-banner': 'Bannière de score',
  'cam-frame': 'Cadre caméra',
  'stream-counters': 'Vues et likes',
  social: 'Réseaux',
  reseaux: 'Réseaux',
  title: 'Titre',
  'score-recap': 'Rappel du score',
  flash: 'Carton plein écran',
  attente: 'Compte à rebours',
  stats: 'Statistiques',
  fil: 'Fil du match',
  'fil-recent': 'Derniers faits',
  lineups: 'Composition',
  'lineups-away': 'Composition (extérieur)',
  multiplex: 'Autres matchs',
  momentum: 'Momentum',
  standings: 'Classement',
  odds: 'Cotes',
  prematch: 'Affiche',
  radar2d: 'Radar',
  sheet: 'Feuille de match',
  shotmap: 'Carte des tirs',
};

export function nomWidget(cle: string): string {
  return NOM_WIDGET[cle] ?? cle;
}

export const DEFAULT_SCENE_ID = 'match';

export function findScene(id: string): Scene {
  return SCENES.find((s) => s.id === id) ?? SCENES.find((s) => s.id === DEFAULT_SCENE_ID)!;
}

export { SLOT, CAM };
