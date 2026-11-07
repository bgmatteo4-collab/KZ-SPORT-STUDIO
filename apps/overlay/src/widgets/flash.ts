/**
 * Les cartons plein écran : but, carton, remplacement.
 *
 * Toujours monté, quelle que soit la scène — une notification ne dépend pas du
 * décor. Il ne s'affiche que sur DÉCLENCHEMENT, jamais en lisant l'état : sinon
 * un rechargement rejouerait les six buts du match à l'antenne.
 *
 * ── Le mouvement ────────────────────────────────────────────────────────────
 *
 * Sur un but, une vague aux couleurs du club traverse l'écran en diagonale et
 * dépose une plaque qui tourne dans l'espace avant de se stabiliser. La vague
 * arrive du CÔTÉ qui a marqué : à gauche pour l'équipe à domicile, à droite
 * pour l'extérieur. Ce n'est pas un détail décoratif — c'est la première
 * information que le spectateur reçoit, un quart de seconde avant de pouvoir
 * lire le nom.
 *
 * Tout passe par des RESSORTS et non par des transitions :
 *
 *   • une transition a une durée fixe ; si un second but tombe pendant que le
 *     premier se pose, elle repart de zéro et on voit la saccade ;
 *   • un ressort conserve la vitesse en cours, donc le second carton prend la
 *     suite du premier au lieu de le couper net.
 *
 * Ça arrive pour de vrai : deux buts en trente secondes, ce n'est pas rare, et
 * c'est précisément le moment où l'habillage doit tenir.
 *
 * Un carton jaune et un remplacement n'ont PAS droit à la vague. Elle est
 * réservée au but : tout mettre au même niveau revient à ne rien souligner.
 */

import { paireCouleurs, type Trigger } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
import { anime, MOUVEMENTS } from '../ressort.js';
import { crestEl, paintCrest, type AnyTeam } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

const HOLD_MS = 5_200;
/** Le ressort de la vague : long, sans dépassement — elle balaie, elle ne rebondit pas. */
const BALAYAGE = { reponse: 0.78, amorti: 1 };

export const flash: WidgetFactory = (): Widget => {
  const onde = h('i', { class: 'flash__onde' });
  const crest = crestEl('flash__crest');
  const kicker = h('div', { class: 'flash__kicker' }, ['']);
  const titleEl = h('div', { class: 'flash__title' }, ['']);
  const sub = h('div', { class: 'flash__sub' }, ['']);
  const minute = h('div', { class: 'flash__minute' }, ['']);
  const card = h('div', { class: 'flash__card', 'data-kind': 'goal' }, [
    crest,
    h('div', { class: 'flash__text' }, [kicker, titleEl, sub]),
    minute,
  ]);
  const el = h('div', { class: 'flash', 'data-on': '0' }, [onde, card]);

  let hideAt = 0;
  /** De quel côté la vague arrive : −1 depuis la gauche, +1 depuis la droite. */
  let sens = -1;

  const balayer = anime(0, BALAYAGE, (v) => {
    // De hors-champ à hors-champ : la vague traverse et sort.
    //
    // `sens` vaut −1 pour l'équipe à domicile, qui est à GAUCHE de la
    // bannière : sa vague part donc de la gauche, à −180 %. La première
    // version multipliait par −180 et faisait traverser l'écran à l'envers,
    // depuis le camp qui n'avait pas marqué.
    const depart = sens * 180;
    const arrivee = sens * -140;
    onde.style.transform = `translateX(${depart + (arrivee - depart) * v}%) skewX(-18deg)`;
  });

  // La plaque : elle tourne dans l'espace et se pose avec un léger dépassement.
  const poser = anime(0, MOUVEMENTS.surface, (v) => {
    const sortie = 1 - v;
    card.style.opacity = String(Math.min(1, v * 1.5));
    card.style.transform =
      `perspective(1600px) translateZ(${-280 * sortie}px)` +
      ` rotateY(${sens * 54 * sortie}deg) rotateX(${-14 * sortie}deg)`;
  });

  return {
    el,
    update({ realNow }: WidgetContext) {
      // Temps RÉEL : un carton doit tenir cinq secondes à l'écran, pas cinq
      // secondes de match — en rejeu accéléré ce serait un clignotement.
      if (hideAt !== 0 && realNow >= hideAt) {
        hideAt = 0;
        // La plaque repart par où elle est venue plutôt que de disparaître
        // d'un coup : une sortie brutale se remarque autant qu'une entrée
        // ratée.
        poser(0);
        window.setTimeout(() => {
          if (hideAt === 0) setAttr(el, 'data-on', '0');
        }, 420);
      }
    },
    trigger(trigger: Trigger, ctx: WidgetContext) {
      const content = describe(trigger, ctx);
      if (!content) return;

      sens = content.side === 'away' ? 1 : -1;
      setAttr(card, 'data-kind', content.kind);
      setAttr(el, 'data-onde', content.kind === 'goal' ? '1' : '0');
      paintCrest(crest, content.team);
      setText(kicker, content.kicker);
      setText(titleEl, content.title);
      setText(sub, content.sub);
      setText(minute, content.minute);

      // La couleur de la vague vient de la PAIRE : un maillot bordeaux posé
      // sur un plateau sombre ne se verrait pas traverser, et deux équipes aux
      // couleurs proches donneraient deux fois la même vague.
      const teintes = paireCouleurs(ctx.state.meta?.home, ctx.state.meta?.away);
      el.style.setProperty('--teinte', content.side === 'home' ? teintes.home : teintes.away);

      setAttr(el, 'data-on', '1');
      hideAt = ctx.realNow + HOLD_MS;

      // Une RELANCE, pas deux appels successifs : poser la position et la
      // cible dans le même tour est la seule façon d'être sûr qu'aucune
      // autre consigne ne s'intercale. La vague d'un vrai but est partie à
      // l'envers une fois pour cette raison exacte.
      if (content.kind === 'goal') balayer.relancer(0, 1);
      poser.relancer(0, 1);
    },
  };
};

interface Contenu {
  kind: string;
  kicker: string;
  title: string;
  sub: string;
  minute: string;
  side: 'home' | 'away';
  team?: AnyTeam;
}

function describe(trigger: Trigger, { state }: WidgetContext): Contenu | null {
  const teamOf = (side: 'home' | 'away') => (side === 'home' ? state.meta?.home : state.meta?.away);

  switch (trigger.kind) {
    case 'goal': {
      const g = trigger.entry;
      const how = g.penalty ? 'sur penalty' : g.ownGoal ? 'contre son camp' : '';
      const passe = g.assist ? `passe de ${g.assist.short}` : '';
      return {
        kind: 'goal',
        kicker: `But — ${teamOf(g.side)?.short ?? ''}`,
        title: g.scorer?.short ?? 'But',
        // La minute part à droite, en grand : elle n'a plus à se battre avec
        // le reste pour une place dans la même ligne.
        sub: [how, `${g.score[0]} – ${g.score[1]}`, passe].filter(Boolean).join('  ·  '),
        minute: `${g.minute}'`,
        side: g.side,
        ...(teamOf(g.side) ? { team: teamOf(g.side)! } : {}),
      };
    }
    case 'card': {
      const c = trigger.entry;
      const red = c.card === 'red' || c.card === 'second_yellow';
      return {
        kind: red ? 'card-red' : 'card',
        kicker: red ? 'Carton rouge' : 'Carton jaune',
        title: c.player?.short ?? teamOf(c.side)?.short ?? '',
        sub: teamOf(c.side)?.short ?? '',
        minute: `${c.minute}'`,
        side: c.side,
        ...(teamOf(c.side) ? { team: teamOf(c.side)! } : {}),
      };
    }
    case 'substitution': {
      const s = trigger.entry;
      if (!s.in && !s.out) return null;
      return {
        kind: 'sub',
        kicker: `Remplacement — ${teamOf(s.side)?.short ?? ''}`,
        title: s.in?.short ?? '',
        sub: `sort : ${s.out?.short ?? '—'}`,
        minute: `${s.minute}'`,
        side: s.side,
        ...(teamOf(s.side) ? { team: teamOf(s.side)! } : {}),
      };
    }
    // Un changement de période ne mérite pas un plein écran.
    case 'phase':
      return null;
  }
}
