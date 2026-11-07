/**
 * Le multiplex : les autres matchs.
 *
 * C'est le panneau le plus regardé d'un watchalong — les gens veulent savoir
 * ce qui se passe ailleurs sans quitter le direct.
 *
 * ── Les trois défauts que la réécriture corrige ─────────────────────────────
 *
 * 1. IL NE VOYAIT QU'UN CHAMPIONNAT. La source ne rendait que les rencontres
 *    du championnat suivi. Un vendredi de Brasileirão où un seul match se
 *    jouait, le panneau restait vide toute la soirée — alors que trente
 *    matchs tournaient ailleurs. Il voit maintenant tout le football du jour.
 *
 * 2. IL NE DISAIT PAS QUAND ÇA MARQUAIT. Un score changeait entre deux
 *    rafraîchissements et rien ne le signalait. C'est pourtant la SEULE chose
 *    qu'un multiplex apporte qu'une liste de résultats n'apporte pas : « ça
 *    vient de marquer à Lens ». Le réducteur date désormais chaque changement
 *    de score, et la ligne s'allume pendant vingt-cinq secondes.
 *
 * 3. IL NE HIÉRARCHISAIT RIEN. Ouvert à tout le football, il affichait cent
 *    matchs dans l'ordre du fournisseur, la Ligue 1 derrière une troisième
 *    division. L'ordre vient maintenant de `trierMultiplex`, dans le cœur :
 *    ce qui vient de marquer, puis ce qui joue, puis la compétition qui
 *    intéresse le public.
 *
 * Mise en page relevée sur le produit de référence : la minute vit DANS LA
 * MARGE, en petit et en rouge, sans pastille — une pastille pleine attire
 * l'œil plus que le score, qui est l'information.
 */

import { grouperMultiplex, type OtherMatch, trierMultiplex, vientDeMarquer } from '@kz/core';
import { h, setAttr, setText } from '../dom.js';
import { crestEl, paintCrest } from './crest.js';
import { panel } from './panel.js';
import type { Widget, WidgetContext, WidgetFactory } from './types.js';

export const multiplex: WidgetFactory = (ctx): Widget => {
  const large = ctx.opts.large === true;
  // Grouper par compétition : indispensable sur une scène plein écran, où
  // vingt lignes de dix championnats différents ne se lisent plus. Inutile
  // dans un bandeau de quatre lignes, où les en-têtes mangeraient la moitié
  // de la place.
  const groupe = ctx.opts.groupe === true;
  const box = panel({ icon: 'live', kicker: 'En direct', title: 'Matchs' });

  // La pastille de direct, à droite de l'en-tête.
  const live = h('i', { class: 'mx__live' });
  box.el.querySelector('.panel__aside')?.append(live);

  const list = h('div', { class: large ? 'multiplex multiplex--two' : 'multiplex' });
  // Un panneau vide SANS un mot ressemble à une panne. Il arrive pourtant
  // vraiment qu'aucun autre match ne se joue — un lundi soir, par exemple.
  const vide = h('p', { class: 'mx__vide t-caption', hidden: '' }, [
    'Aucun autre match en cours',
  ]);
  // Ce qu'on ne montre pas. Sans cette ligne, un soir de Coupe d'Europe, le
  // panneau laisse croire que huit matchs se jouent quand il y en a quarante.
  const reste = h('p', { class: 'mx__reste t-caption', hidden: '' }, ['']);
  box.body.append(list, vide, reste);

  let signature: string | null = null;

  /** Hauteur d'un bloc de match, gouttière comprise. */
  // Un bandeau large et court n'a pas la même économie qu'une colonne haute :
  // à hauteur de bloc égale, il n'afficherait que quatre matchs là où il y a la
  // place pour huit. On resserre, comme un bandeau de résultats à la télévision.
  const BLOC_NORMAL = 84;
  const BLOC_DENSE = 62;
  /** Ce que mange l'en-tête du panneau. */
  const CHROME = 76 + 24;
  /** Et un titre de compétition, dans le mode groupé. */
  const TITRE_GROUPE = 28;
  /** Et la ligne « + N autres rencontres », presque toujours présente. */
  const RESTE = 26;

  return {
    el: box.el,
    update({ state, box: slot }: WidgetContext) {
      const tous = state.otherMatches;
      const t = state.t;
      setAttr(live, 'data-on', tous.some((m) => m.live) ? '1' : '0');

      // Douze matchs écrasés dans une colonne ne se lisent plus : chaque bloc
      // perd la séparation qui en fait un match distinct. On montre ce qui
      // tient en gardant les blocs lisibles.
      //
      // Un emplacement nettement plus large que haut est un BANDEAU, pas une
      // colonne : on y resserre les blocs, sinon il reste à moitié vide.
      const dense = slot.h > 0 && slot.w / slot.h > 2;
      setAttr(list, 'data-dense', dense ? '1' : '0');
      const BLOC = dense ? BLOC_DENSE : BLOC_NORMAL;
      // La ligne « + N autres rencontres » est comptée D'AVANCE : depuis que
      // le multiplex voit tout le football, elle est presque toujours là, et
      // l'oublier coûtait exactement le bas du dernier bloc. Un seul match
      // affiché proprement vaut mieux que deux dont l'un est tranché.
      const parColonne =
        slot.h > 0 ? Math.max(1, Math.floor((slot.h - CHROME - RESTE) / BLOC)) : tous.length;
      const capacite = large ? parColonne * 2 : parColonne;

      // La compétition du match commenté passe devant le reste du monde : ce
      // sont ses rencontres qui font bouger le classement qu'on affiche.
      const prioritaire = state.meta?.competitionId;

      const paquets = groupe
        ? decouper(grouperMultiplex(tous, t, prioritaire), capacite, parColonne, TITRE_GROUPE, BLOC)
        : [{ competition: '', matches: trierMultiplex(tous, t, prioritaire).slice(0, capacite) }];

      const montres = paquets.reduce((n, p) => n + p.matches.length, 0);

      // La signature inclut l'état « vient de marquer » : sans lui, la ligne
      // resterait allumée jusqu'au prochain changement de score.
      const next = paquets
        .map(
          (p) =>
            `${p.competition}>${p.matches
              .map((m) => `${m.id}:${m.score[0]}-${m.score[1]}:${m.minute}:${vientDeMarquer(m, t) ? 1 : 0}`)
              .join('|')}`,
        )
        .join('//');
      if (next === signature) return;
      signature = next;

      list.replaceChildren();
      vide.hidden = montres > 0;

      const cache = tous.length - montres;
      reste.hidden = cache <= 0;
      if (cache > 0) setText(reste, `+ ${cache} autre${cache > 1 ? 's' : ''} rencontre${cache > 1 ? 's' : ''}`);

      for (const paquet of paquets) {
        if (groupe && paquet.competition) {
          list.append(h('div', { class: 'mx__groupe t-kicker' }, [paquet.competition]));
        }
        for (const match of paquet.matches) list.append(bloc(match, t, groupe));
      }
    },
  };
};

/**
 * L'heure de coup d'envoi, dans le fuseau de la machine qui diffuse.
 *
 * C'est volontairement l'heure LOCALE et non UTC : le streamer et son public
 * sont au même endroit, et « 21:00 » est ce qu'ils ont en tête. Les deux
 * sources navigateur d'OBS tournent sur la même machine, donc affichent la
 * même valeur.
 */
function heure(kickoff: number | undefined): string {
  if (kickoff === undefined || !Number.isFinite(kickoff)) return '—';
  const d = new Date(kickoff);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Un bloc de match : la minute dans la marge, les deux lignes à droite. */
function bloc(match: OtherMatch, t: number, groupe: boolean): HTMLElement {
  const rows = h('div', { class: 'mx__rows' });
  for (const [team, goals] of [
    [match.home, match.score[0]],
    [match.away, match.score[1]],
  ] as const) {
    const crest = crestEl('mx__crest');
    paintCrest(crest, team);
    rows.append(
      h('div', { class: 'mx__row' }, [
        crest,
        h('span', { class: 'mx__name' }, [team.short.toUpperCase()]),
        h('span', { class: 'mx__goals' }, [String(goals)]),
      ]),
    );
  }

  // Un match qui n'a pas commencé n'a pas de minute. Afficher un tiret, quinze
  // fois dans la colonne, ne dit rien ; son heure de coup d'envoi, si.
  const minute = h('div', { class: 'mx__minute' }, [
    match.minute === '—' ? heure(match.kickoff) : match.minute,
  ]);
  if (!match.live) minute.dataset.off = '1';

  const marge = h('div', { class: 'mx__marge' }, [minute]);
  const butant = vientDeMarquer(match, t);

  // Le signalement vit DANS LA MARGE, sous la minute — pas posé par-dessus la
  // ligne. Première version : une pastille en absolu en haut à droite, qui se
  // superposait au score. Le score est l'information ; rien ne doit jamais
  // passer dessus, surtout pas l'étiquette qui dit qu'il vient de changer.
  if (butant) marge.append(h('span', { class: 'mx__but' }, ['BUT']));
  // Hors mode groupé, la compétition s'écrit sous la minute : « 2-1 » ne dit
  // rien si on ignore s'il s'agit de la Ligue 1 ou d'une D2 scandinave. Elle
  // cède la place au signalement pendant les vingt-cinq secondes qu'il dure.
  else if (!groupe && match.competition) {
    marge.append(h('div', { class: 'mx__ligue' }, [match.competition]));
  }

  const el = h('div', { class: 'mx' }, [marge, rows]);
  if (butant) el.dataset.but = '1';
  return el;
}

/**
 * Répartit la capacité entre les groupes.
 *
 * Un titre de compétition coûte une demi-ligne de match : les compter comme
 * des matchs ferait déborder le panneau d'un ou deux blocs, et un bloc coupé
 * en deux se voit bien plus à l'antenne qu'un bloc absent.
 *
 * On sert les groupes dans l'ordre déjà décidé — donc celui où ça vient de
 * marquer en premier — et on s'arrête quand la place est prise. Un groupe
 * d'un seul match est gardé : c'est souvent le match isolé d'une grande
 * compétition, et c'est justement celui qu'on veut voir.
 */
function decouper<T extends { competition: string; matches: OtherMatch[] }>(
  groupes: T[],
  capacite: number,
  parColonne: number,
  coutTitre: number,
  coutBloc: number,
): { competition: string; matches: OtherMatch[] }[] {
  const out: { competition: string; matches: OtherMatch[] }[] = [];
  // Le titre est converti en « équivalent-blocs » pour rester dans la même
  // unité que la capacité, qui compte des matchs.
  const titreEnBlocs = Math.max(1, Math.round(coutTitre / coutBloc));
  let restant = capacite;

  for (const g of groupes) {
    if (restant <= titreEnBlocs) break;
    const place = restant - titreEnBlocs;
    const pris = g.matches.slice(0, Math.min(place, parColonne));
    if (pris.length === 0) break;
    out.push({ competition: g.competition, matches: pris });
    restant -= pris.length + titreEnBlocs;
  }

  return out;
}
