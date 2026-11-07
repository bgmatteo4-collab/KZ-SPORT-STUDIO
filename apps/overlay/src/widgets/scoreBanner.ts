/**
 * La bannière de score : la pièce maîtresse du plateau.
 *
 * Structure relevée sur le produit de référence — une SEULE bande, et tout
 * vit dedans :
 *
 *   ┌──────────────────────────────────────────────────────────┬──────────┐
 *   │  REAL MADRID  [écu]  0 │ 0  [écu]  MAN CITY              │ LIGUE DES│
 *   └──────────────────────────────────────────────────────────┴──────────┘
 *            buteurs  ·  CHRONO souligné d'or  ·  buteurs
 *
 * Les écus sont DANS le cadre, encadrant le score : trois pièces qui flottent
 * séparément ne font pas un habillage, elles font un montage.
 *
 * Le cartouche de compétition est calé à l'extrémité droite, et une cale
 * invisible de même largeur à gauche garde le score exactement au centre.
 */

import { type Buteur, buteurs, clockLabel, embleme, PHASE_LABEL } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const scoreBanner: WidgetFactory = (): Widget => {
  const crestHome = crestEl('banner__crest');
  const crestAway = crestEl('banner__crest');
  const nameHome = h('div', { class: 'banner__team banner__team--home t-hero' }, ['—']);
  const nameAway = h('div', { class: 'banner__team banner__team--away t-hero' }, ['—']);
  const digitHome = h('div', { class: 'banner__digit t-score' }, ['0']);
  const digitAway = h('div', { class: 'banner__digit t-score' }, ['0']);

  const compName = h('div', { class: 'banner__comp-name' }, ['']);
  const compRound = h('div', { class: 'banner__comp-round' }, ['']);
  // L'emblème de la compétition, quand le fournisseur en donne l'adresse. Il
  // ne remplace pas le nom : à l'antenne, un logo seul laisse le spectateur
  // qui ne le reconnaît pas sans rien. Il le précède.
  const compLogo = h('img', { class: 'banner__comp-logo', alt: '', decoding: 'async' });
  const compText = h('div', { class: 'banner__comp-text' }, [compName, compRound]);
  const compCap = h('div', { class: 'banner__comp' }, [compLogo, compText]);
  compLogo.addEventListener('load', () => compCap.setAttribute('data-logo', '1'));
  compLogo.addEventListener('error', () => compCap.removeAttribute('data-logo'));
  /** L'adresse de l'emblème actuellement affiché, pour ne pas le recharger. */
  let emblemeAffiche = '';

  const scorersHome = h('div', { class: 'banner__scorers banner__scorers--home' });
  const scorersAway = h('div', { class: 'banner__scorers' });
  const rouleauDom = rouleau(scorersHome);
  const rouleauExt = rouleau(scorersAway);
  const clockMain = h('span', {}, ['0:00']);
  const clockAdded = h('span', { class: 'banner__added' });
  const liveDot = h('div', { class: 'banner__live', 'data-on': '0' }, [
    h('i'),
    h('span', { class: 't-caption' }, ['Direct']),
  ]);

  const el = h('div', { class: 'banner' }, [
    h('div', { class: 'banner__plate' }, [
      // La cale : même largeur que le cartouche, pour que le score reste centré.
      h('div', { class: 'banner__shim' }),
      nameHome,
      crestHome,
      h('div', { class: 'banner__score' }, [digitHome, digitAway]),
      crestAway,
      nameAway,
      compCap,
    ]),
    h('div', { class: 'banner__strip' }, [
      scorersHome,
      h('div', { class: 'banner__clock' }, [clockMain, clockAdded]),
      scorersAway,
    ]),
    liveDot,
  ]);

  let lastGoalSeq = -1;

  return {
    el,
    update({ state, clockMs, realNow }: WidgetContext) {
      const meta = state.meta;
      paintCrest(crestHome, meta?.home);
      paintCrest(crestAway, meta?.away);
      setText(nameHome, meta?.home.short.toUpperCase() ?? '—');
      setText(nameAway, meta?.away.short.toUpperCase() ?? '—');
      setText(digitHome, String(state.score[0]));
      setText(digitAway, String(state.score[1]));

      // « Ligue des Champions — Quart de finale » se coupe en deux lignes :
      // la compétition au-dessus, le tour en dessous.
      const [competition, round] = splitCompetition(meta?.competition, meta?.round);
      setText(compName, competition);
      setText(compRound, round);

      // Un emblème déposé dans `assets/competitions/` prime sur celui du
      // fournisseur : ESPN sert encore le logo de Ligue 1 d'avant 2020.
      const voulu = embleme(meta?.competitionId, meta?.competitionCrest) ?? '';
      if (voulu !== emblemeAffiche) {
        emblemeAffiche = voulu;
        compCap.removeAttribute('data-logo');
        if (voulu) compLogo.setAttribute('src', voulu);
        else compLogo.removeAttribute('src');
      }

      const label = clockLabel(clockMs, state.phase, state.clock.addedMinutes);
      const running =
        state.phase === 'first_half' ||
        state.phase === 'second_half' ||
        state.phase === 'extra_first' ||
        state.phase === 'extra_second';
      setText(clockMain, running ? label.main : PHASE_LABEL[state.phase].toUpperCase());
      setText(clockAdded, running ? (label.added ?? '') : '');

      setAttr(liveDot, 'data-on', state.phase !== 'pre' && state.phase !== 'full_time' ? '1' : '0');

      // Les buteurs ne bougent qu'au but : inutile de reconstruire 60 fois/s.
      const latest = state.goals.length === 0 ? -1 : state.goals[state.goals.length - 1]!.seq;
      if (latest !== lastGoalSeq) {
        lastGoalSeq = latest;
        // Regroupés par buteur : un doublé tient sur une ligne avec ses deux
        // minutes, comme à la télévision.
        const tous = buteurs(state.goals);
        rouleauDom.poser(tous.filter((b) => b.side === 'home').map(ligneButeur));
        rouleauExt.poser(tous.filter((b) => b.side === 'away').map(ligneButeur));
      }
      rouleauDom.avancer(realNow);
      rouleauExt.avancer(realNow);
    },
  };
};

function splitCompetition(competition?: string, round?: string): [string, string] {
  if (!competition) return ['', ''];
  const parts = competition.split(/\s+[—–-]\s+/);
  if (parts.length > 1) return [parts[0]!, parts.slice(1).join(' — ')];
  return [competition, round ?? ''];
}

/** « CASTILLO 23' 67' » — ce qu'on écrit pour un buteur. */
function ligneButeur(b: Buteur): { nom: string; suite: string } {
  const suffixe = b.penalty ? ' (sp)' : b.ownGoal ? ' (csc)' : '';
  return { nom: b.nom.toUpperCase(), suite: ` ${b.minutes.join("' ")}'${suffixe}` };
}

/**
 * Le rouleau des buteurs.
 *
 * ── Le défaut ───────────────────────────────────────────────────────────────
 *
 * Les buteurs s'écrivaient les uns derrière les autres dans une pastille de
 * 420 px. Un but, ça tient. Deux, c'est serré. À partir de trois, tout se
 * chevauche et on ne lit plus rien — y compris le nom de celui qui vient de
 * marquer, c'est-à-dire la seule chose qu'on regarde à cet instant.
 *
 * ── La réponse ──────────────────────────────────────────────────────────────
 *
 * Au-delà de deux noms, ils passent par deux, en roulant vers le haut. Le
 * dernier but marqué ouvre toujours la série : on voit d'abord ce qui vient
 * d'arriver, puis le reste.
 *
 * La rotation se mesure sur le temps RÉEL et non sur le chrono du match : un
 * rejeu à vingt fois la vitesse ferait défiler les noms vingt fois plus vite,
 * donc illisibles — alors que la lisibilité, elle, se mesure en secondes
 * d'horloge murale.
 */
const PAR_PAGE = 2;
const TOUR_BUTEURS_MS = 4_200;

function rouleau(hote: HTMLElement): {
  poser(lignes: { nom: string; suite: string }[]): void;
  avancer(realNow: number): void;
} {
  let pages: { nom: string; suite: string }[][] = [];
  let page = 0;
  let prochain = 0;

  const dessiner = (): void => {
    hote.replaceChildren();
    for (const ligne of pages[page] ?? []) {
      hote.append(h('span', {}, [h('b', {}, [ligne.nom]), ligne.suite]));
    }
    // Les points ne sont là que s'il y a vraiment plusieurs pages : trois
    // points sous un seul buteur feraient croire à quelque chose de caché.
    if (pages.length > 1) {
      const points = h('i', { class: 'banner__points' });
      for (let i = 0; i < pages.length; i += 1) {
        const p = h('u');
        if (i === page) p.dataset.on = '1';
        points.append(p);
      }
      hote.append(points);
    }
    hote.dataset.neuf = '1';
    // Le retrait de l'attribut relance l'animation d'entrée au tour suivant.
    requestAnimationFrame(() => requestAnimationFrame(() => delete hote.dataset.neuf));
  };

  return {
    poser(lignes) {
      // Le dernier but en tête : c'est lui qu'on cherche quand ça vient de
      // marquer. Les pages suivantes remontent le temps.
      const ordre = [...lignes].reverse();
      pages = [];
      for (let i = 0; i < ordre.length; i += PAR_PAGE) {
        pages.push(ordre.slice(i, i + PAR_PAGE));
      }
      page = 0;
      prochain = 0;
      dessiner();
    },
    avancer(realNow) {
      if (pages.length <= 1) return;
      if (prochain === 0) {
        prochain = realNow + TOUR_BUTEURS_MS;
        return;
      }
      if (realNow < prochain) return;
      prochain = realNow + TOUR_BUTEURS_MS;
      page = (page + 1) % pages.length;
      dessiner();
    },
  };
}
