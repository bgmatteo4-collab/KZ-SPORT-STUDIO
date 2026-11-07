/**
 * Le bloc réseaux.
 *
 * ── Ce qu'il remplace ───────────────────────────────────────────────────────
 *
 * Une note de musique et « KZ TV ». Un pictogramme de TikTok sur un plateau de
 * football ne dit rien à personne, et un pseudo seul ne donne aucune raison
 * d'aller quelque part. Un bandeau de réseaux sert à une chose : qu'on
 * retrouve la chaîne après l'émission.
 *
 * ── Pourquoi un seul à la fois ──────────────────────────────────────────────
 *
 * Quatre réseaux côte à côte dans une case de 246 pixels donnent quatre lignes
 * de six pixels que personne ne lit. Ils passent donc chacun leur tour, cinq
 * secondes, en pleine taille — on en lit UN, et on le lit vraiment. C'est la
 * logique d'un bandeau de chaîne, pas d'un pied de page.
 *
 * ── Le mouvement ────────────────────────────────────────────────────────────
 *
 * La bascule est portée par un ressort, pas par une transition de durée fixe :
 * le pseudo sortant et l'entrant se croisent sans que l'un attende l'autre, et
 * un changement de scène en plein milieu ne laisse rien coincé à moitié.
 * `prefers-reduced-motion` coupe le mouvement et garde la rotation.
 */

import { h, setText } from '../dom.js';
import { anime, MOUVEMENTS } from '../ressort.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const NS = 'http://www.w3.org/2000/svg';

interface Reseau {
  nom: string;
  /** Ce qu'on affiche : un pseudo, ou une consigne. */
  pseudo: string;
  /** Les tracés du logo, en viewBox 24×24. */
  chemins: string[];
  /** Rempli plutôt que tracé : les logos de marque sont des aplats. */
  teinte: string;
}

/**
 * Les quatre réseaux, dans l'ordre d'affichage.
 *
 * Les tracés sont des silhouettes simplifiées, dessinées ici : on ne télécharge
 * aucun fichier de marque, et rien de déposé n'entre dans le dépôt — c'est la
 * même règle que pour les écussons de club.
 */
export const RESEAUX: Reseau[] = [
  {
    nom: 'YouTube',
    pseudo: 'Kayzx TV',
    teinte: '#ff0033',
    chemins: [
      'M23 7.5a3 3 0 0 0-2.1-2.1C19 4.8 12 4.8 12 4.8s-7 0-8.9.6A3 3 0 0 0 1 7.5 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.5z',
      'M9.8 15.3V8.7l5.7 3.3z',
    ],
  },
  {
    nom: 'X',
    pseudo: '@Kayzx_TV',
    teinte: '#ffffff',
    chemins: [
      'M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.7 21H1.5l7.5-8.6L1.1 3h6.6l4.5 5.6zm-1.1 16h1.8L7.7 4.8H5.8z',
    ],
  },
  {
    nom: 'Twitch',
    pseudo: 'Kayzxx_tv',
    teinte: '#a970ff',
    chemins: [
      'M4 2 2.5 5.8v13.4h4.6V22h2.6l2.6-2.8h3.8L21.5 14V2zm15.8 11-3 3.2h-4.6l-2.6 2.8v-2.8H5.9V3.8h13.9z',
      'M15.9 7.1h1.7v5h-1.7zM11.3 7.1H13v5h-1.7z',
    ],
  },
  {
    nom: 'Discord',
    pseudo: '!discord dans le chat',
    teinte: '#5865f2',
    chemins: [
      'M19.3 5.4A17 17 0 0 0 15 4l-.2.4a16 16 0 0 1 3.7 1.5 15.6 15.6 0 0 0-13-.5A16.4 16.4 0 0 1 9.2 4.4L9 4a17 17 0 0 0-4.3 1.4C2 9.5 1.3 13.4 1.6 17.3a17.2 17.2 0 0 0 5.2 2.6l1-1.7a11 11 0 0 1-1.8-.8l.4-.3a12.3 12.3 0 0 0 10.4 0l.4.3a11 11 0 0 1-1.8.9l1 1.6a17.2 17.2 0 0 0 5.2-2.6c.4-4.5-.6-8.4-2.3-11.9zM8.4 14.9c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1zm7.2 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1z',
    ],
  },
];

/** Combien de temps chaque réseau reste. */
const TOUR_MS = 5_000;

function logo(reseau: Reseau): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'reseaux__logo');
  for (const d of reseau.chemins) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', reseau.teinte);
    svg.append(path);
  }
  return svg;
}

export const reseaux: WidgetFactory = (): Widget => {
  const el = h('div', { class: 'reseaux' });
  const piste = h('div', { class: 'reseaux__piste' });
  el.append(piste);

  // Deux cartes qui se croisent : la sortante et l'entrante. Les recréer à
  // chaque bascule ferait clignoter les logos le temps du rendu.
  const cartes = [0, 1].map(() => {
    const marque = h('span', { class: 'reseaux__marque' });
    const pseudo = h('span', { class: 'reseaux__pseudo' });
    const carte = h('div', { class: 'reseaux__carte' }, [marque, pseudo]);
    piste.append(carte);
    return { carte, marque, pseudo };
  });

  let index = -1;
  /** Laquelle des deux cartes est devant. */
  let devant = 0;
  let prochain = 0;

  // Le ressort porte la position des DEUX cartes : l'entrante monte de 100 %
  // à 0, la sortante de 0 à −100 %. Une seule valeur anime les deux.
  const glisser = anime(0, MOUVEMENTS.surface, (v) => {
    cartes[devant]!.carte.style.transform = `translateY(${(1 - v) * 100}%)`;
    cartes[devant]!.carte.style.opacity = String(Math.min(1, v * 1.6));
    const autre = cartes[1 - devant]!;
    autre.carte.style.transform = `translateY(${-v * 100}%)`;
    autre.carte.style.opacity = String(Math.max(0, 1 - v * 1.6));
  });

  function poser(reseau: Reseau, cible: (typeof cartes)[number]): void {
    cible.marque.replaceChildren(logo(reseau), h('b', {}, [reseau.nom]));
    setText(cible.pseudo, reseau.pseudo);
  }

  return {
    el,
    update({ realNow }: WidgetContext) {
      // La rotation se mesure sur le temps RÉEL : un rejeu accéléré ne doit
      // pas faire défiler les réseaux vingt fois plus vite.
      if (realNow < prochain) return;
      prochain = realNow + TOUR_MS;

      index = (index + 1) % RESEAUX.length;
      const reseau = RESEAUX[index]!;

      if (index === 0 && prochain === realNow + TOUR_MS && cartes[0]!.pseudo.textContent === '') {
        // Tout premier affichage : on pose sans animer, sinon le plateau
        // s'ouvre sur une case vide le temps du mouvement.
        poser(reseau, cartes[0]!);
        cartes[0]!.carte.style.transform = 'translateY(0)';
        cartes[0]!.carte.style.opacity = '1';
        cartes[1]!.carte.style.opacity = '0';
        return;
      }

      devant = 1 - devant;
      poser(reseau, cartes[devant]!);
      // On repart de zéro à chaque bascule : la valeur du ressort décrit la
      // progression d'UN croisement, pas une position absolue.
      cartes[devant]!.carte.style.transform = 'translateY(100%)';
      glisser(0);
      requestAnimationFrame(() => glisser(1));
    },
  };
};
