/**
 * La confrontation : ce qu'on sait AVANT le coup d'envoi.
 *
 * ── Ce que ce panneau remplace ──────────────────────────────────────────────
 *
 * La scène « Feuille de match » montrait la chronologie du match en cours et
 * la courbe de momentum. Deux blocs qui ne disent RIEN tant que le match n'a
 * pas commencé — et c'est précisément le moment où l'on a le plus de temps
 * d'antenne à remplir. Un quart d'heure devant une chronologie vide et une
 * courbe plate, c'est l'inverse de ce dont un avant-match a besoin.
 *
 * ── Les trois questions d'un avant-match ────────────────────────────────────
 *
 * Elles sont toujours les mêmes, dans cet ordre, et c'est l'ordre du panneau :
 *
 *   OÙ EN SONT-ILS ?   le bilan de la saison, comparé
 *   COMMENT VONT-ILS ? les cinq dernières sorties, résultat par résultat
 *   ET ENTRE EUX ?     les dernières oppositions directes
 *
 * ── Ce qui n'y est pas, et pourquoi ─────────────────────────────────────────
 *
 * Aucune prédiction, aucune « probabilité de victoire ». On a les cotes, on
 * pourrait en dériver un pourcentage — et ce serait un chiffre inventé
 * présenté comme un fait. Le panneau montre ce qui S'EST PASSÉ ; ce qui va se
 * passer, c'est le travail du commentateur.
 *
 * Et rien ici n'est masqué par le décalage anti-spoiler : ces matchs ont été
 * joués il y a des semaines.
 */

import {
  type Confrontation,
  type RencontrePassee,
  type StandingRow,
  type TeamBrief,
  paireCouleurs,
} from '@kz/core';
import { h, setScaleX, setText } from '../dom.js';
import { listeAnimee, type EntreeListe } from '../mouvement.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

/** Combien de face-à-face on montre au plus. */
const FACE_MAX = 5;

interface LigneBilan {
  libelle: string;
  lire: (r: StandingRow) => number | undefined;
  /** Pour les grandeurs où le plus PETIT est le meilleur. */
  invert?: boolean;
  format?: (v: number) => string;
}

/*
 * Le bilan vient du CLASSEMENT, pas d'un calcul maison. Un champ absent fait
 * disparaître sa ligne : une coupe n'a pas de colonne « nuls », et un zéro
 * inventé se lit exactement comme un vrai zéro.
 */
const BILAN: LigneBilan[] = [
  { libelle: 'Points', lire: (r) => r.points },
  { libelle: 'Victoires', lire: (r) => r.won },
  { libelle: 'Nuls', lire: (r) => r.drawn },
  { libelle: 'Défaites', lire: (r) => r.lost, invert: true },
  { libelle: 'Buts marqués', lire: (r) => r.goalsFor },
  { libelle: 'Buts encaissés', lire: (r) => r.goalsAgainst, invert: true },
];

export const confrontation: WidgetFactory = (): Widget => {
  const box = panel({
    icon: 'table',
    kicker: 'Avant le coup d’envoi',
    title: 'Confrontation',
    crests: 2,
  });

  // ── Le bilan ──
  const bilan = h('div', { class: 'conf__bilan' });
  const lignes = BILAN.map((spec) => {
    const dom = h('span', { class: 'bar__num t-l' }, ['—']);
    const ext = h('span', { class: 'bar__num bar__num--away t-l' }, ['—']);
    const fill = h('i', { class: 'bar__fill' });
    const node = h('div', { class: 'bar' }, [
      h('div', { class: 'bar__track' }, [
        fill,
        dom,
        h('span', { class: 'bar__label t-label' }, [spec.libelle]),
        ext,
      ]),
    ]);
    bilan.append(node);
    return { spec, dom, ext, fill, node };
  });

  // ── La forme ──
  const formeDom = h('div', { class: 'conf__forme-ligne' });
  const formeExt = h('div', { class: 'conf__forme-ligne' });
  const forme = h('div', { class: 'conf__forme' }, [
    h('div', { class: 'conf__rubrique t-kicker' }, ['Les cinq dernières sorties']),
    formeDom,
    formeExt,
  ]);

  // ── Le face-à-face ──
  const faceBilan = h('span', { class: 'conf__face-bilan t-caption' }, ['']);
  const faceListe = h('div', { class: 'conf__face-liste' });
  const face = h('div', { class: 'conf__face' }, [
    h('div', { class: 'conf__rubrique t-kicker' }, [
      h('span', {}, ['Leurs dernières rencontres']),
      faceBilan,
    ]),
    faceListe,
  ]);

  const defile = listeAnimee(faceListe);

  const vide = h('p', { class: 'conf__vide t-caption', hidden: '' }, [
    'Pas d’historique pour cette affiche',
  ]);

  box.body.append(h('div', { class: 'conf' }, [bilan, forme, face, vide]));

  let signature: string | null = null;

  return {
    el: box.el,
    update({ state }: WidgetContext) {
      const dom = state.meta?.home;
      const ext = state.meta?.away;
      box.setCrests([dom, ext]);

      const conf: Confrontation | null = state.confrontation;
      const rangDom = rangDe(state.standings, dom);
      const rangExt = rangDe(state.standings, ext);

      const next = JSON.stringify([
        rangDom?.rank ?? null,
        rangDom?.points ?? null,
        rangExt?.rank ?? null,
        rangExt?.points ?? null,
        conf?.forme.home.map((r) => r.resultat).join('') ?? '',
        conf?.forme.away.map((r) => r.resultat).join('') ?? '',
        conf?.face.map((r) => `${r.t}:${r.score[0]}-${r.score[1]}`).join('|') ?? '',
        dom?.short ?? '',
        ext?.short ?? '',
      ]);
      if (next === signature) return;
      signature = next;

      const teintes = paireCouleurs(dom, ext);

      // ── Bilan ──
      let visibles = 0;
      for (const { spec, dom: d, ext: e, fill, node } of lignes) {
        const a = rangDom ? spec.lire(rangDom) : undefined;
        const b = rangExt ? spec.lire(rangExt) : undefined;
        if (a === undefined || b === undefined) {
          node.hidden = true;
          continue;
        }
        node.hidden = false;
        visibles += 1;
        setText(d, String(a));
        setText(e, String(b));
        const somme = a + b;
        if (somme === 0) setScaleX(fill, 0.5);
        else setScaleX(fill, spec.invert ? b / somme : a / somme);
      }
      bilan.hidden = visibles === 0;

      // ── Forme ──
      const aForme = (conf?.forme.home.length ?? 0) + (conf?.forme.away.length ?? 0) > 0;
      forme.hidden = !aForme;
      if (aForme && conf) {
        poserForme(formeDom, dom, conf.forme.home, teintes.home);
        poserForme(formeExt, ext, conf.forme.away, teintes.away);
      }

      // ── Face-à-face ──
      const rencontres = (conf?.face ?? []).slice(0, FACE_MAX);
      face.hidden = rencontres.length === 0;
      if (rencontres.length > 0) {
        const v = rencontres.filter((r) => r.resultat === 'V').length;
        const n = rencontres.filter((r) => r.resultat === 'N').length;
        const d = rencontres.filter((r) => r.resultat === 'D').length;
        // Lu du point de vue du DOMICILE, et dit explicitement : « 2–2–1 »
        // tout seul se lit dans les deux sens, donc dans aucun.
        setText(faceBilan, `${dom?.abbr ?? 'DOM'} ${v}V · ${n}N · ${d}D`);
        const entrees: EntreeListe[] = rencontres.map((r) => ({
          cle: String(r.t),
          faire: () => ligneFace(r, dom, ext),
        }));
        defile.rendre(entrees);
      }

      vide.hidden = visibles > 0 || aForme || rencontres.length > 0;
    },
  };
};

/** La ligne du classement d'une équipe, si elle y est. */
function rangDe(rows: StandingRow[], equipe: TeamBrief | undefined): StandingRow | undefined {
  if (!equipe) return undefined;
  return rows.find((r) =>
    r.team.id && equipe.id ? r.team.id === equipe.id : r.team.short === equipe.short,
  );
}

/**
 * Une ligne de forme : l'écu, puis cinq pastilles.
 *
 * Le plus RÉCENT à gauche. C'est l'ordre inverse de celui d'un tableau de
 * championnat anglais, et c'est volontaire : ici on lit de gauche à droite en
 * remontant le temps, comme un fil, et la pastille la plus à gauche est celle
 * dont on parle.
 */
function poserForme(
  hote: HTMLElement,
  equipe: TeamBrief | undefined,
  matchs: readonly RencontrePassee[],
  teinte: string,
): void {
  const crest = crestEl('conf__crest');
  paintCrest(crest, equipe);
  const nom = h('span', { class: 'conf__forme-nom' }, [(equipe?.short ?? '—').toUpperCase()]);
  const enfants: HTMLElement[] = [crest, nom];

  for (const m of matchs.slice(0, 5)) {
    const pastille = h('i', { class: 'conf__pastille' }, [m.resultat]);
    pastille.dataset.res = m.resultat;
    // Le détail au survol n'existe pas à l'antenne : le titre sert à la régie,
    // qui ouvre le même overlay dans un navigateur.
    pastille.title = `${m.domicile ? 'vs' : '@'} ${m.adversaire.short} ${m.score[0]}–${m.score[1]}`;
    enfants.push(pastille);
  }

  hote.replaceChildren(...enfants);
  hote.style.setProperty('--teinte', teinte);
}

/** Une rencontre passée : la date, puis le score dans le sens domicile-extérieur. */
function ligneFace(
  r: RencontrePassee,
  dom: TeamBrief | undefined,
  ext: TeamBrief | undefined,
): HTMLElement {
  // `r` est orientée sur l'équipe qui reçoit CE SOIR. On réécrit la ligne dans
  // l'ordre où ce match-là s'est joué : lire « Vitória 2–0 Fluminense » pour
  // un match disputé à Rio serait faux, même si le score est juste.
  const gauche = r.domicile ? dom : r.adversaire;
  const droite = r.domicile ? r.adversaire : dom;
  const bg = r.domicile ? r.score[0] : r.score[1];
  const bd = r.domicile ? r.score[1] : r.score[0];

  const ecuG = crestEl('conf__face-crest');
  paintCrest(ecuG, gauche);
  const ecuD = crestEl('conf__face-crest');
  paintCrest(ecuD, droite ?? ext);

  const ligne = h('div', { class: 'conf__face-ligne' }, [
    h('span', { class: 'conf__face-date t-caption' }, [dateCourte(r.t)]),
    ecuG,
    h('span', { class: 'conf__face-nom' }, [(gauche?.short ?? '—').toUpperCase()]),
    h('span', { class: 'conf__face-score' }, [`${bg}–${bd}`]),
    h('span', { class: 'conf__face-nom conf__face-nom--droite' }, [
      (droite?.short ?? '—').toUpperCase(),
    ]),
    ecuD,
  ]);
  ligne.dataset.res = r.resultat;
  return ligne;
}

/** « 09/05/26 ». Les dates passées n'ont pas besoin de l'heure. */
function dateCourte(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return '—';
  const d = new Date(t);
  const jj = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${String(d.getFullYear()).slice(2)}`;
}
