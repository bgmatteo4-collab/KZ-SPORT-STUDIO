/**
 * Les ressorts.
 *
 * ── Pourquoi pas une courbe CSS ─────────────────────────────────────────────
 *
 * Une `cubic-bezier` a une DURÉE fixe. Si la valeur change pendant qu'elle
 * joue, l'animation repart de zéro sur la nouvelle cible : le mouvement
 * saccade, et plus on manipule vite, plus ça se voit. En régie on manipule
 * vite — on pousse le décalage de quart de seconde en quart de seconde avec
 * les flèches, et chaque pression interrompt la précédente.
 *
 * Un ressort n'a pas de durée : il a une position, une vitesse et une cible.
 * Changer la cible en plein vol ne casse rien, la vitesse en cours est
 * conservée, et le mouvement reste continu. C'est pour ça que les systèmes
 * d'Apple sont passés aux ressorts, et c'est exactement le cas d'usage ici.
 *
 * ── Les deux réglages, et pas six ───────────────────────────────────────────
 *
 * On ne règle PAS une raideur et un amortissement en unités physiques :
 * personne ne sait ce que vaut « k = 180 ». On règle :
 *
 *   • `reponse` — la durée approximative du mouvement, en secondes ;
 *   • `amorti`  — 1 s'arrête net, en dessous ça dépasse et revient.
 *
 * La conversion vers le modèle masse-raideur-amortissement est celle que
 * SwiftUI emploie, avec une masse de 1 :
 *
 *     k = (2π / réponse)²        c = 4π × amorti / réponse
 *
 * ── L'intégration ───────────────────────────────────────────────────────────
 *
 * Pas intégré en une fois par image. À 60 images par seconde un pas vaut
 * 16 ms, et un ressort raide y devient instable — il oscille au lieu de se
 * poser. On découpe donc en sous-pas de 4 ms, ce qui tient jusqu'à des
 * réponses très courtes. Et on borne le temps écoulé : un onglet remis au
 * premier plan après une minute ne doit pas rattraper une minute de physique
 * d'un seul coup.
 */

/** Sous-pas d'intégration, en secondes. */
const PAS = 0.004;
/** Au-delà, on considère qu'on revient d'une mise en veille. */
const SAUT_MAX = 0.1;

export interface ReglageRessort {
  /** Durée approximative du mouvement, en secondes. */
  reponse: number;
  /** 1 = aucun dépassement. En dessous, ça dépasse et revient. */
  amorti: number;
}

export class Ressort {
  private position: number;
  private vitesse = 0;
  private cible: number;
  private k: number;
  private c: number;

  constructor(depart: number, reglage: ReglageRessort) {
    this.position = depart;
    this.cible = depart;
    const w = (2 * Math.PI) / reglage.reponse;
    this.k = w * w;
    this.c = (4 * Math.PI * reglage.amorti) / reglage.reponse;
  }

  /** Change la cible SANS casser le mouvement : la vitesse est conservée. */
  viser(valeur: number): void {
    this.cible = valeur;
  }

  /** Pose la valeur sans animation — au premier rendu, ou en mouvement réduit. */
  poser(valeur: number): void {
    this.position = valeur;
    this.cible = valeur;
    this.vitesse = 0;
  }

  get valeur(): number {
    return this.position;
  }

  /** Le ressort est-il arrivé ? Sert à cesser de redessiner. */
  get repos(): boolean {
    return Math.abs(this.position - this.cible) < 0.0005 && Math.abs(this.vitesse) < 0.0005;
  }

  /** Avance de `dtMs` millisecondes. Rend la nouvelle position. */
  avance(dtMs: number): number {
    const dt = Math.min(SAUT_MAX, dtMs / 1000);
    let reste = dt;
    while (reste > 0) {
      const pas = Math.min(PAS, reste);
      const acceleration = -this.k * (this.position - this.cible) - this.c * this.vitesse;
      this.vitesse += acceleration * pas;
      this.position += this.vitesse * pas;
      reste -= pas;
    }
    if (this.repos) {
      this.position = this.cible;
      this.vitesse = 0;
    }
    return this.position;
  }
}

/**
 * Le mouvement est-il refusé par le système ?
 *
 * Lu à chaque appel plutôt que mémorisé : le réglage peut changer pendant
 * qu'une émission tourne, et une régie qui exige un rechargement pour en
 * tenir compte n'en tient pas compte.
 */
export function mouvementReduit(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Anime quelque chose tant que le ressort n'est pas au repos.
 *
 * Rend une fonction « viser » : on lui donne la nouvelle cible, elle relance
 * la boucle si besoin. Aucune boucle ne tourne quand rien ne bouge — une
 * régie ouverte toute une soirée ne doit pas consommer une image sur deux à
 * animer des choses immobiles.
 */
export function anime(
  depart: number,
  reglage: ReglageRessort,
  dessiner: (valeur: number) => void,
): (cible: number) => void {
  const ressort = new Ressort(depart, reglage);
  let actif = false;
  let precedent = 0;

  const image = (maintenant: number): void => {
    const dt = precedent === 0 ? 16 : maintenant - precedent;
    precedent = maintenant;
    dessiner(ressort.avance(dt));
    if (ressort.repos) {
      actif = false;
      precedent = 0;
      return;
    }
    requestAnimationFrame(image);
  };

  dessiner(ressort.valeur);

  return (cible: number): void => {
    if (mouvementReduit()) {
      ressort.poser(cible);
      dessiner(cible);
      return;
    }
    ressort.viser(cible);
    if (!actif) {
      actif = true;
      requestAnimationFrame(image);
    }
  };
}

/**
 * Les trois mouvements de l'interface.
 *
 * Trois, pas trente : une interface où chaque élément a sa propre durée ne se
 * lit pas comme un tout. Celui qui répond à un geste doit être bref et sans
 * dépassement ; celui qui fait apparaître une surface peut se permettre un
 * léger rebond, qui donne le poids.
 */
export const MOUVEMENTS = {
  /** Réponse immédiate à un clic : interrupteur, onglet, bouton. */
  vif: { reponse: 0.26, amorti: 0.86 },
  /** Une surface qui arrive ou qui part : sélecteur, panneau. */
  surface: { reponse: 0.42, amorti: 0.82 },
  /** Une valeur qui se déplace sans qu'on l'ait demandé : jauge, chiffre. */
  doux: { reponse: 0.55, amorti: 1 },
} as const satisfies Record<string, ReglageRessort>;
