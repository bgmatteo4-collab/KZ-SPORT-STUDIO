/**
 * La carte des tirs.
 *
 * ── Pourquoi c'est le bloc qui manquait ─────────────────────────────────────
 *
 * Un tableau dit « 9 tirs, 5 cadrés ». Il ne dit pas que les neuf sont partis
 * de vingt-cinq mètres, ni que les cinq cadrés venaient tous du même côté. Or
 * c'est exactement ce qu'on perd quand on ne voit pas les images : non pas le
 * NOMBRE d'occasions, mais leur DANGER.
 *
 * ── D'où vient la donnée ────────────────────────────────────────────────────
 *
 * Du fil du match : chaque frappe y porte sa position sur le terrain. Elle est
 * donnée RELATIVEMENT au but attaqué — les deux équipes tirent donc vers des
 * `x` élevés. C'est ici qu'on les met face à face : l'équipe à domicile attaque
 * vers la droite, l'extérieur vers la gauche, comme à la télévision.
 *
 * Un tir sans position n'est pas inventé au centre : il est compté dans le
 * bilan et absent de la carte. Une pastille posée au hasard mentirait sur la
 * seule chose que ce bloc est censé montrer.
 */

import { paireCouleurs, type ShotEntry, type Side } from '@kz/core';
import { h, setText } from '../dom.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const NS = 'http://www.w3.org/2000/svg';

/** Le terrain, en unités de 0 à 100 en longueur et de 0 à 100 en largeur. */
function terrain(): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 64');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'tirs__terrain');

  const trait = (attrs: Record<string, string>, nom = 'rect'): void => {
    const el = document.createElementNS(NS, nom);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.setAttribute('class', 'tirs__ligne');
    svg.append(el);
  };

  trait({ x: '0.4', y: '0.4', width: '99.2', height: '63.2', rx: '1.4' });
  trait({ x1: '50', y1: '0.4', x2: '50', y2: '63.6' }, 'line');
  trait({ cx: '50', cy: '32', r: '8.4' }, 'circle');
  // Les deux surfaces, et les deux buts.
  trait({ x: '0.4', y: '15.2', width: '13.6', height: '33.6' });
  trait({ x: '86', y: '15.2', width: '13.6', height: '33.6' });
  trait({ x: '0.4', y: '24.8', width: '4.6', height: '14.4' });
  trait({ x: '95', y: '24.8', width: '4.6', height: '14.4' });
  return svg;
}

/** Où poser la pastille, en pourcentage du cadre. */
function place(shot: ShotEntry): { gauche: number; haut: number } | null {
  if (shot.x === undefined || shot.y === undefined) return null;
  // `x` est une distance au but ATTAQUÉ : on renvoie l'extérieur de l'autre
  // côté, pour que les deux équipes se fassent face comme à la télévision.
  const gauche = shot.side === 'home' ? shot.x : 100 - shot.x;
  const haut = shot.side === 'home' ? shot.y : 100 - shot.y;
  return { gauche, haut };
}

export const shotmap: WidgetFactory = (): Widget => {
  const box = panel({ icon: 'radar', kicker: 'En direct', title: 'Carte des tirs', crests: 2 });

  const pastilles = h('div', { class: 'tirs__pastilles' });
  const scene = h('div', { class: 'tirs__scene' }, [terrain(), pastilles]);

  const compteur = (classe: string) =>
    h('span', { class: `tirs__compte tirs__compte--${classe}` }, ['0']);
  const butsD = compteur('home');
  const butsE = compteur('away');
  const cadresD = compteur('home');
  const cadresE = compteur('away');
  const totalD = compteur('home');
  const totalE = compteur('away');

  const ligne = (titre: string, d: HTMLElement, e: HTMLElement) =>
    h('div', { class: 'tirs__bilan-ligne' }, [d, h('span', { class: 't-caption' }, [titre]), e]);

  const bilan = h('div', { class: 'tirs__bilan' }, [
    ligne('Tirs', totalD, totalE),
    ligne('Cadrés', cadresD, cadresE),
    ligne('Buts', butsD, butsE),
  ]);

  // Sans ces deux repères, la carte est illisible : rien ne dit quelle moitié
  // appartient à qui. L'équipe à domicile attaque vers la droite, donc ses
  // frappes vivent dans la moitié droite — et c'est exactement ce qu'il faut
  // écrire plutôt que laisser deviner.
  const sensExt = h('span', { class: 'tirs__sens tirs__sens--away' }, ['—']);
  const sensDom = h('span', { class: 'tirs__sens tirs__sens--home' }, ['—']);
  const sens = h('div', { class: 'tirs__sens-ligne t-caption' }, [sensExt, sensDom]);

  const absents = h('p', { class: 'tirs__absents t-caption', hidden: '' }, ['']);

  box.body.append(scene, sens, bilan, absents);

  let signature: string | null = null;

  return {
    el: box.el,

    update({ state }: WidgetContext) {
      const meta = state.meta;
      box.setCrests([meta?.home, meta?.away]);

      // Deux maillots rouge sombre donnaient deux fois la même pastille. La
      // paire est calculée une fois, dans le cœur, et partagée avec le fil :
      // une frappe a la même couleur dans les deux blocs.
      const teintes = paireCouleurs(meta?.home, meta?.away);
      setText(sensExt, `◀ ${meta?.away.short ?? 'Extérieur'}`);
      setText(sensDom, `${meta?.home.short ?? 'Domicile'} ▶`);
      sensExt.style.color = teintes.away;
      sensDom.style.color = teintes.home;

      const shots = state.shots;
      const next = `${shots.length}|${teintes.home}${teintes.away}|${shots.map((s) => `${s.seq}${s.outcome ?? ''}`).join(',')}`;
      if (next === signature) return;
      signature = next;

      // ── Le bilan, qui compte TOUT, même ce qu'on ne peut pas placer ────────
      const compter = (side: Side, test: (s: ShotEntry) => boolean): string =>
        String(shots.filter((s) => s.side === side && test(s)).length);
      const cadre = (s: ShotEntry): boolean => s.outcome === 'on_target' || s.outcome === 'goal';

      setText(totalD, compter('home', () => true));
      setText(totalE, compter('away', () => true));
      setText(cadresD, compter('home', cadre));
      setText(cadresE, compter('away', cadre));
      setText(butsD, compter('home', (s) => s.outcome === 'goal'));
      setText(butsE, compter('away', (s) => s.outcome === 'goal'));

      // ── La carte, qui ne montre que ce qu'elle sait placer ────────────────
      pastilles.replaceChildren();
      let sansPlace = 0;

      for (const shot of shots) {
        const où = place(shot);
        if (!où) {
          sansPlace += 1;
          continue;
        }
        const point = h('i', {
          class: `tirs__point tirs__point--${shot.outcome ?? 'off_target'}`,
          'data-side': shot.side,
          title: `${shot.player?.short ?? ''} ${shot.minute}'`.trim(),
        });
        point.style.left = `${où.gauche.toFixed(2)}%`;
        point.style.top = `${où.haut.toFixed(2)}%`;
        point.style.setProperty('--teinte', shot.side === 'home' ? teintes.home : teintes.away);
        pastilles.append(point);
      }

      // Dire ce qui manque plutôt que de le poser au hasard : une pastille
      // inventée mentirait sur la seule chose que cette carte montre.
      absents.hidden = sansPlace === 0;
      if (sansPlace > 0) {
        setText(
          absents,
          `${sansPlace} tir${sansPlace > 1 ? 's' : ''} sans position connue, compté${sansPlace > 1 ? 's' : ''} dans le bilan`,
        );
      }
    },
  };
};
