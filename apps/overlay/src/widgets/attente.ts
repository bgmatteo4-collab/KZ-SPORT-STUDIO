/**
 * L'écran d'attente.
 *
 * ── Ce qu'il résout ─────────────────────────────────────────────────────────
 *
 * Les dix minutes avant le coup d'envoi sont les plus importantes d'un
 * watchalong : les gens arrivent, le streamer parle, et l'écran doit dire deux
 * choses en même temps — « le live a commencé » et « le match, lui, n'a pas
 * encore commencé ». Un tableau de bord rempli de zéros dit le contraire des
 * deux.
 *
 * D'où ce widget : une AFFICHE, pas un tableau. Les deux équipes en grand, un
 * compte à rebours qui descend vraiment, et ce qu'on sait déjà du match — la
 * compétition, le stade, le rapport de force annoncé par les cotes.
 *
 * ── Sur quelle horloge il descend ───────────────────────────────────────────
 *
 * Sur l'instant RENDU — celui que le spectateur a sous les yeux, décalage
 * anti-spoiler compris. Pas sur l'heure de la machine.
 *
 * La différence n'est pas théorique : avec trente secondes de décalage, un
 * compte à rebours calé sur l'heure réelle atteindrait zéro une demi-minute
 * avant que le spectateur ne voie le coup d'envoi. Il annoncerait un match qui,
 * pour lui, n'a pas commencé.
 *
 * Et en rejeu accéléré il descend à la même vitesse que le match, ce qui est
 * bien ce qu'on veut : le coup d'envoi arrive vingt fois plus tôt.
 *
 * Passé le coup d'envoi, il ne compte pas à l'envers : il annonce que ça a
 * commencé et s'efface. Un compte à rebours négatif est un bug à l'antenne.
 */

import type { Odds } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/** En dessous d'une minute, on compte les secondes : la tension monte. */
function compteARebours(restantMs: number): { valeur: string; unite: string } {
  const s = Math.max(0, Math.floor(restantMs / 1000));
  const heures = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secondes = s % 60;

  if (heures > 0) {
    return { valeur: `${heures} h ${String(minutes).padStart(2, '0')}`, unite: 'avant le coup d’envoi' };
  }
  if (minutes > 0) {
    return {
      valeur: `${minutes}:${String(secondes).padStart(2, '0')}`,
      unite: 'avant le coup d’envoi',
    };
  }
  return { valeur: String(secondes), unite: 'secondes' };
}

export const attente: WidgetFactory = (): Widget => {
  const crestHome = crestEl('att__crest');
  const crestAway = crestEl('att__crest');
  const nameHome = h('div', { class: 'att__team' }, ['—']);
  const nameAway = h('div', { class: 'att__team' }, ['—']);

  const valeur = h('div', { class: 'att__valeur' }, ['—']);
  const unite = h('div', { class: 'att__unite t-caption' }, ['']);
  const horloge = h('div', { class: 'att__horloge' }, [valeur, unite]);

  const affiche = h('div', { class: 'att__affiche' }, [
    h('div', { class: 'att__side' }, [crestHome, nameHome]),
    horloge,
    h('div', { class: 'att__side' }, [crestAway, nameAway]),
  ]);

  const competition = h('span', { class: 'att__fait' }, ['—']);
  const stade = h('span', { class: 'att__fait' }, ['—']);
  const heure = h('span', { class: 'att__fait' }, ['—']);
  const faits = h('div', { class: 'att__faits' }, [competition, stade, heure]);

  const fillHome = h('i', { class: 'att__fill att__fill--home' });
  const fillDraw = h('i', { class: 'att__fill att__fill--draw' });
  const fillAway = h('i', { class: 'att__fill att__fill--away' });
  const pctHome = h('span', {}, ['—']);
  const pctDraw = h('span', {}, ['N —']);
  const pctAway = h('span', {}, ['—']);
  const cotes = h('div', { class: 'att__cotes' }, [
    h('div', { class: 'att__bar' }, [fillHome, fillDraw, fillAway]),
    h('div', { class: 'att__legend t-caption' }, [pctHome, pctDraw, pctAway]),
  ]);

  const el = h('div', { class: 'att' }, [affiche, faits, cotes]);

  let vuMeta = '';
  let vuCotes = '';

  return {
    el,
    // Le compte à rebours bouge chaque seconde : il doit être rafraîchi en
    // continu, comme l'horloge du match.
    animated: true,

    update({ state, now }: WidgetContext) {
      const meta = state.meta;

      const signature = meta ? `${meta.home.id}|${meta.away.id}|${meta.kickoff}` : '';
      if (signature !== vuMeta) {
        vuMeta = signature;
        paintCrest(crestHome, meta?.home);
        paintCrest(crestAway, meta?.away);
        setText(nameHome, meta?.home.short ?? '—');
        setText(nameAway, meta?.away.short ?? '—');
        setText(competition, meta?.competition ?? '—');
        setText(stade, meta?.venue ?? '—');
        setText(
          heure,
          meta
            ? new Date(meta.kickoff).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—',
        );
      }

      // ── Le compte à rebours ────────────────────────────────────────────────
      const restant = meta ? meta.kickoff - now : null;
      if (restant === null) {
        setText(valeur, '—');
        setText(unite, 'en attente des informations du match');
        setAttr(el, 'data-etat', 'vide');
      } else if (restant <= 0) {
        // Pas de compte à rebours négatif : on dit que c'est parti.
        setText(valeur, 'C’est parti');
        setText(unite, 'le match a commencé');
        setAttr(el, 'data-etat', 'commence');
      } else {
        const { valeur: v, unite: u } = compteARebours(restant);
        setText(valeur, v);
        setText(unite, u);
        // Sous cinq minutes, l'écran se tend : c'est le moment où les gens
        // reviennent de leur cuisine.
        setAttr(el, 'data-etat', restant < 5 * 60_000 ? 'imminent' : 'attente');
      }

      // ── Le rapport de force annoncé ────────────────────────────────────────
      const o: Odds | null = state.odds;
      const sign = o ? `${o.home}|${o.draw}|${o.away}` : '';
      if (sign !== vuCotes) {
        vuCotes = sign;
        if (!o) {
          setAttr(cotes, 'data-on', '0');
        } else {
          // Cote décimale → probabilité implicite, normalisée pour retirer la
          // marge du bookmaker. Sans ça les trois barres dépassent 100 %.
          const brut = [1 / o.home, 1 / o.draw, 1 / o.away];
          const total = brut[0]! + brut[1]! + brut[2]!;
          const [ph, pn, pa] = brut.map((b) => (b / total) * 100) as [number, number, number];
          setAttr(cotes, 'data-on', '1');
          // `flex-grow` plutôt qu'un `scaleX` : les trois segments doivent se
          // PARTAGER la barre. Mis à l'échelle chacun dans son tiers, ils
          // laisseraient des trous entre eux.
          fillHome.style.flexGrow = String(ph);
          fillDraw.style.flexGrow = String(pn);
          fillAway.style.flexGrow = String(pa);
          setText(pctHome, `${Math.round(ph)} %`);
          setText(pctDraw, `N ${Math.round(pn)} %`);
          setText(pctAway, `${Math.round(pa)} %`);
        }
      }
    },
  };
};
