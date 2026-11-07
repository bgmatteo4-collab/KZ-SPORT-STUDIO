/**
 * Le momentum : qui pousse, et pourquoi.
 *
 * ── Les deux défauts de la première version ─────────────────────────────────
 *
 * 1. Elle traçait les DOUZE DERNIÈRES MINUTES de temps mural. À la mi-temps
 *    il ne s'est rien passé depuis dix minutes : la courbe devenait un trait
 *    plat avec une marche au bord, exactement là où l'on a le plus besoin de
 *    raconter la période écoulée. La fenêtre couvre maintenant le MATCH, du
 *    coup d'envoi à l'instant rendu.
 *
 * 2. Elle affirmait « 82 % » sans dire d'où ça venait. Une courbe qu'on ne
 *    peut pas justifier ressemble à une panne. Chaque échantillon de pression
 *    porte désormais SA CAUSE — c'est ce que `PressureSample.kind` a ajouté —
 *    et le bloc écrit dessous « 3 tirs cadrés · 2 corners ».
 *
 * Tout le calcul reste dans le réducteur ; ici on ne fait que lire et tracer.
 */

import { type MatchState, paireCouleurs, type PousseeKind, pourquoi } from '@kz/core';
import { h, setText } from '../dom.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/** Résolution de la courbe. Plus que ça ne se voit pas à l'antenne. */
const STEPS = 90;
const HALF_LIFE = 2.5 * 60_000;
/**
 * Fenêtre minimale. À la 4e minute, tracer « depuis le coup d'envoi » sur
 * quatre minutes étire un seul corner sur tout le cadre et fait croire à une
 * domination écrasante. En dessous de ce seuil, on laisse de l'air à droite.
 */
const SPAN_MIN = 10 * 60_000;
/** Sur quoi porte la phrase d'explication. */
const EXPLICATION = 10 * 60_000;
/**
 * Ce qu'il faut de pression cumulée pour que la courbe atteigne ses bords.
 *
 * Vaut le poids d'un tir cadré : un fait isolé ne doit pas suffire à annoncer
 * une domination.
 */
const ADOUCISSEUR = 3;

export const momentum: WidgetFactory = (): Widget => {
  const canvas = h('canvas', { class: 'momentum__canvas' });
  const homeName = h('span', { class: 'momentum__team' }, ['—']);
  const awayName = h('span', { class: 'momentum__team' }, ['—']);
  const homeShare = h('span', { class: 'momentum__share t-l' }, ['50%']);
  const awayShare = h('span', { class: 'momentum__share t-l' }, ['50%']);
  const cause = h('p', { class: 'momentum__cause t-caption' }, ['']);

  const box = panel({ icon: 'radar', kicker: 'Depuis le coup d’envoi', title: 'Momentum' });
  box.body.append(
    h('div', { class: 'momentum' }, [
      h('div', { class: 'momentum__row' }, [homeName, homeShare]),
      h('div', { class: 'momentum__plot' }, [canvas]),
      h('div', { class: 'momentum__row' }, [awayName, awayShare]),
      cause,
    ]),
  );

  let sized = '';

  return {
    // Un canevas : il doit être repeint à chaque image.
    animated: true,
    el: box.el,
    update({ state, theme, box: slot }: WidgetContext) {
      // Dans un créneau court, la phrase cède la place à la courbe : c'est la
      // courbe qui est le bloc, la phrase ne fait que l'expliquer.
      cause.hidden = slot.h > 0 && slot.h < 260;

      setText(homeName, state.meta?.home.short ?? '—');
      setText(awayName, state.meta?.away.short ?? '—');

      const total = state.pressure.home + state.pressure.away;
      const share = total < 0.01 ? 0.5 : state.pressure.home / total;
      setText(homeShare, `${Math.round(share * 100)}%`);
      setText(awayShare, `${Math.round((1 - share) * 100)}%`);

      // ── Pourquoi ──────────────────────────────────────────────────────────
      // On explique le camp qui MÈNE la pression : expliquer les deux donnerait
      // deux lignes qui se neutralisent et n'apprendrait rien.
      const meneur = share >= 0.5 ? 'home' : 'away';
      const recents = state.pressureLog.filter(
        (s) => s.side === meneur && state.t - s.t <= EXPLICATION && s.t <= state.t,
      );
      const nom = (meneur === 'home' ? state.meta?.home.short : state.meta?.away.short) ?? '';
      const texte = pourquoi(recents as readonly { kind: PousseeKind }[]);
      setText(
        cause,
        texte === '' ? 'Rien de notable depuis dix minutes' : nom ? `${nom} — ${texte}` : texte,
      );

      const context = canvas.getContext('2d');
      if (!context) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const key = `${Math.round(rect.width)}x${Math.round(rect.height)}@${dpr}`;
      if (sized !== key) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        sized = key;
      }

      // Les aires portent les couleurs des ÉQUIPES, pas celles du thème : la
      // courbe nomme les deux camps juste au-dessus et au-dessous, il serait
      // absurde que ses deux moitiés soient de l'or et du rouge quelles que
      // soient les équipes. La paire est la même que sur la carte des tirs.
      const teintes = paireCouleurs(state.meta?.home, state.meta?.away);
      homeName.style.color = teintes.home;
      awayName.style.color = teintes.away;
      draw(context, canvas.width, canvas.height, state, theme.tokens, teintes);
    },
  };
};

/**
 * La fenêtre tracée : du coup d'envoi — ou du premier temps fort — à présent.
 *
 * On part du premier échantillon plutôt que de `meta.kickoff` : en rejeu comme
 * en reprise de serveur, le coup d'envoi annoncé peut être loin derrière les
 * données qu'on a réellement.
 */
function fenetre(state: MatchState): { from: number; span: number } {
  const premier = state.pressureLog[0]?.t ?? state.meta?.kickoff ?? state.t - SPAN_MIN;
  const span = Math.max(SPAN_MIN, state.t - premier);
  return { from: state.t - span, span };
}

/** La pression de chaque camp à l'instant `at`, décroissance exponentielle. */
function pressureAt(state: MatchState, at: number): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (let i = state.pressureLog.length - 1; i >= 0; i -= 1) {
    const sample = state.pressureLog[i]!;
    const age = at - sample.t;
    if (age < 0) continue;
    // Au-delà de huit demi-vies un échantillon pèse moins d'un demi-pour-cent :
    // continuer à remonter le journal ne changerait plus un pixel.
    if (age > HALF_LIFE * 8) break;
    const decayed = sample.weight * Math.pow(0.5, age / HALF_LIFE);
    if (sample.side === 'home') home += decayed;
    else away += decayed;
  }
  return { home, away };
}

/**
 * Relie les points par une courbe, pas par des segments.
 *
 * La première version traçait une polyligne : chaque temps fort entrant dans
 * la fenêtre produisait une MARCHE, et une suite de marches ne se lit pas
 * comme un élan, elle se lit comme un signal numérique. L'interpolation de
 * Catmull-Rom passe exactement par chaque point calculé — on ne ment donc pas
 * sur la donnée — mais arrondit ce qu'il y a entre deux.
 *
 * Suppose un `moveTo` déjà fait sur le premier point : la fonction sert aussi
 * bien au tracé qu'au contour des aires.
 */
function tracerLisse(c: CanvasRenderingContext2D, pts: { x: number; y: number }[]): void {
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    c.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

function draw(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: MatchState,
  tokens: { colorHome?: string; accent: string; live: string; panelLine: string; inkDim: string },
  teintes: { home: string; away: string },
): void {
  c.clearRect(0, 0, w, h);

  const mid = h / 2;
  const { from, span } = fenetre(state);

  // Ligne médiane : l'équilibre.
  c.strokeStyle = tokens.panelLine;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, mid);
  c.lineTo(w, mid);
  c.stroke();

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const at = from + (span * i) / STEPS;
    const { home, away } = pressureAt(state, at);
    // −1 (extérieur) … +1 (domicile)
    //
    // Le dénominateur porte un ADOUCISSEUR, et c'est lui qui rend la courbe
    // lisible. Sans lui — `(home - away) / (home + away)` — un unique corner
    // dans une période calme donne un rapport de 1 contre 0, donc une courbe
    // collée au bord : le tracé devenait un signal carré qui sautait d'un
    // extrême à l'autre et ne disait plus rien de l'intensité.
    //
    // Avec un adoucisseur égal au poids d'un tir cadré, l'amplitude se met à
    // signifier quelque chose : une domination franche monte haut, un fait
    // isolé reste près du milieu. La courbe cesse de n'indiquer QUE le camp
    // pour indiquer aussi la FORCE — ce qu'un momentum est censé montrer.
    const bias = (home - away) / (home + away + ADOUCISSEUR);
    points.push({ x: (w * i) / STEPS, y: mid - bias * mid * 0.92 });
  }

  // Les deux aires, de part et d'autre de la médiane.
  //
  // Chaque moitié est DÉCOUPÉE au ciseau plutôt que calculée point par point :
  // rabattre chaque ordonnée sur la médiane, comme le faisait la première
  // version, écrase les courbes là où elles traversent et dessine des angles
  // que la courbe du dessus n'a pas.
  for (const [side, color] of [
    ['home', teintes.home],
    ['away', teintes.away],
  ] as const) {
    c.save();
    c.beginPath();
    c.rect(0, side === 'home' ? 0 : mid, w, mid);
    c.clip();

    c.beginPath();
    c.moveTo(points[0]!.x, mid);
    c.lineTo(points[0]!.x, points[0]!.y);
    tracerLisse(c, points);
    c.lineTo(points[points.length - 1]!.x, mid);
    c.closePath();
    c.fillStyle = color;
    c.globalAlpha = 0.38;
    c.fill();
    c.globalAlpha = 1;
    c.restore();
  }

  // La courbe par-dessus.
  c.beginPath();
  c.moveTo(points[0]!.x, points[0]!.y);
  tracerLisse(c, points);
  c.strokeStyle = '#fff';
  c.lineWidth = Math.max(2, h / 48);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();

  // Les buts : des repères verticaux sur la courbe. Ce sont eux qui donnent
  // l'échelle de temps — sans eux, la courbe n'a pas de date.
  for (const goal of state.goals) {
    if (goal.t < from || goal.t > state.t) continue;
    const x = ((goal.t - from) / span) * w;
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.strokeStyle = tokens.inkDim;
    c.lineWidth = 1;
    c.setLineDash([4, 4]);
    c.stroke();
    c.setLineDash([]);

    c.beginPath();
    c.arc(x, goal.side === 'home' ? h * 0.16 : h * 0.84, Math.max(3, h / 26), 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
  }
}
