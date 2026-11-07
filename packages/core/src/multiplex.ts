/**
 * Le multiplex : quoi montrer, dans quel ordre.
 *
 * ── Le problème que ce fichier résout ───────────────────────────────────────
 *
 * Le multiplex tirait ses matchs du SEUL championnat qu'on suivait. Un
 * vendredi de Brasileirão, le panneau restait vide toute la soirée alors que
 * trente rencontres se jouaient ailleurs. Élargi à tout le football du jour,
 * il a aussitôt le défaut inverse : cent matchs pour huit lignes, et la Ligue
 * 1 derrière un championnat de troisième division suédoise.
 *
 * Il faut donc CHOISIR, et le choix doit être le même sur les deux sources
 * navigateur d'OBS — d'où une fonction pure, ici, plutôt qu'un tri improvisé
 * dans le widget.
 *
 * ── Les trois règles, dans cet ordre ────────────────────────────────────────
 *
 * 1. CE QUI VIENT DE BOUGER passe devant tout. Un but ailleurs est la seule
 *    chose qu'un multiplex apporte vraiment : sans ça, autant publier les
 *    résultats à la fin.
 * 2. CE QUI JOUE passe devant ce qui est fini ou pas commencé.
 * 3. À égalité, la compétition la plus intéressante pour le public visé.
 */

import type { OtherMatch } from './types.js';

/**
 * Combien de temps un but d'ailleurs reste signalé.
 *
 * Vingt-cinq secondes : assez pour qu'un streamer qui parlait le voie en
 * levant les yeux, trop court pour qu'un panneau reste allumé en permanence
 * un soir de Coupe d'Europe.
 */
export const FLASH_MS = 25_000;

/**
 * L'intérêt d'une compétition, de 0 à 100.
 *
 * C'est un jugement ÉDITORIAL, pas un fait, et il est assumé comme tel : la
 * chaîne est francophone, donc la Ligue 1 passe devant la Serie B. Le barème
 * vit ici, en un seul endroit, pour qu'on puisse le discuter — plutôt que
 * d'être éparpillé dans des conditions au fil du rendu.
 *
 * Une compétition absente de la table vaut 30 : au-dessus de rien, en dessous
 * de tout ce qu'on a nommé. Un match qu'on ne sait pas situer reste donc
 * affichable, ce qui vaut toujours mieux que de le cacher.
 */
export const INTERET: Record<string, number> = {
  'uefa.champions': 100,
  'fra.1': 98,
  'uefa.europa': 92,
  'eng.1': 90,
  'esp.1': 88,
  'ita.1': 84,
  'ger.1': 82,
  'uefa.europa.conf': 80,
  'fra.coupe_de_france': 78,
  'fifa.world': 76,
  'uefa.euro': 75,
  'uefa.nations': 72,
  'fra.2': 70,
  'por.1': 62,
  'ned.1': 60,
  'bel.1': 58,
  'eng.fa': 58,
  'esp.copa_del_rey': 56,
  'ita.coppa_italia': 56,
  'ger.dfb_pokal': 56,
  'tur.1': 52,
  'sco.1': 50,
  'eng.2': 48,
  'ksa.1': 46,
  'usa.1': 44,
  'bra.1': 44,
  'arg.1': 42,
  'esp.2': 40,
  'ita.2': 40,
  'ger.2': 40,
  'fra.w.1': 54,
  'uefa.wchampions': 54,
  'eng.w.1': 44,
  'esp.w.1': 42,
  'usa.nwsl': 40,
};

export const INTERET_INCONNU = 30;

/**
 * Le nom court d'une compétition, pour une marge de bandeau.
 *
 * La marge d'un bloc de multiplex fait soixante-seize pixels et tient deux
 * lignes d'une dizaine de caractères. « Premier League » y passe, parce qu'il
 * se coupe à l'espace. « Championship » est un seul mot de douze lettres : il
 * se coupait en « Champi / onship », ce qui est pire qu'un nom tronqué.
 *
 * Seules les compétitions qui posent problème figurent ici, avec
 * l'abréviation que les supporters emploient — « LDC », pas « L. des Ch. ».
 * Une compétition absente de la table garde son nom entier.
 */
export const NOM_COURT: Record<string, string> = {
  'uefa.champions': 'LDC',
  'uefa.europa': 'Europa',
  'uefa.europa.conf': 'Conférence',
  'uefa.wchampions': 'LDC fém.',
  'uefa.super_cup': 'Supercoupe',
  'uefa.nations': 'Nations',
  'eng.2': 'Champ.',
  'sco.1': 'Écosse',
  'ksa.1': 'Saudi PL',
  'fra.coupe_de_france': 'Coupe de Fr.',
  'ger.dfb_pokal': 'Coupe d’All.',
  'ita.coppa_italia': 'Coupe d’It.',
  'eng.w.1': 'WSL fém.',
  'fra.w.1': 'D1 fém.',
};

export function nomCourtCompetition(id: string | undefined, nom: string | undefined): string {
  if (id && NOM_COURT[id]) return NOM_COURT[id];
  return nom ?? '';
}

export function interetDe(competitionId?: string): number {
  return competitionId ? (INTERET[competitionId] ?? INTERET_INCONNU) : INTERET_INCONNU;
}

/** Ce match vient-il de marquer, à l'instant `t` ? */
export function vientDeMarquer(m: OtherMatch, t: number): boolean {
  if (m.scoreChangedAt === undefined) return false;
  const age = t - m.scoreChangedAt;
  return age >= 0 && age < FLASH_MS;
}

/**
 * Les matchs dans l'ordre où il faut les montrer.
 *
 * Ne coupe pas : c'est au widget de savoir combien de lignes tiennent dans
 * son créneau, et à lui seul.
 *
 * `prioritaire` est la compétition du match qu'on commente : ses autres
 * rencontres passent devant le reste du monde, parce que ce sont elles qui
 * font bouger le classement qu'on vient d'afficher. C'est la seule entorse à
 * la hiérarchie générale, et elle est motivée.
 */
export function trierMultiplex(
  matches: readonly OtherMatch[],
  t: number,
  prioritaire?: string,
): OtherMatch[] {
  return [...matches].sort((a, b) => {
    const butA = vientDeMarquer(a, t) ? 1 : 0;
    const butB = vientDeMarquer(b, t) ? 1 : 0;
    if (butA !== butB) return butB - butA;

    if (a.live !== b.live) return a.live ? -1 : 1;

    const memeA = prioritaire && a.competitionId === prioritaire ? 1 : 0;
    const memeB = prioritaire && b.competitionId === prioritaire ? 1 : 0;
    if (memeA !== memeB) return memeB - memeA;

    const iA = interetDe(a.competitionId);
    const iB = interetDe(b.competitionId);
    if (iA !== iB) return iB - iA;

    // Dernier recours : l'identifiant, pour que l'ordre soit STABLE. Deux
    // matchs équivalents qui permuteraient d'un rafraîchissement à l'autre
    // feraient clignoter le panneau sans qu'il se passe rien.
    return a.id.localeCompare(b.id);
  });
}

/**
 * Les matchs regroupés par compétition, les groupes dans l'ordre d'intérêt.
 *
 * Huit lignes de huit championnats différents ne se lisent pas : l'œil ne
 * sait pas si « 2-1 » est un match de Ligue 1 ou de D2 norvégienne. Les
 * grouper rend chaque ligne lisible à la seule condition de garder les
 * groupes courts — d'où le tri des matchs À L'INTÉRIEUR d'un groupe par les
 * mêmes règles que la liste plate.
 */
export function grouperMultiplex(
  matches: readonly OtherMatch[],
  t: number,
  prioritaire?: string,
): { competition: string; competitionId?: string; matches: OtherMatch[] }[] {
  const paquets = new Map<string, OtherMatch[]>();
  for (const m of matches) {
    const cle = m.competitionId ?? m.competition ?? '';
    const liste = paquets.get(cle);
    if (liste) liste.push(m);
    else paquets.set(cle, [m]);
  }

  return [...paquets.entries()]
    .map(([cle, liste]) => {
      const trie = trierMultiplex(liste, t, prioritaire);
      return {
        competition: liste[0]?.competition ?? 'Autres rencontres',
        ...(cle ? { competitionId: cle } : {}),
        matches: trie,
      };
    })
    .sort((a, b) => {
      // Un groupe où ça vient de marquer remonte en tête, comme une ligne.
      const butA = a.matches.some((m) => vientDeMarquer(m, t)) ? 1 : 0;
      const butB = b.matches.some((m) => vientDeMarquer(m, t)) ? 1 : 0;
      if (butA !== butB) return butB - butA;

      const liveA = a.matches.some((m) => m.live) ? 1 : 0;
      const liveB = b.matches.some((m) => m.live) ? 1 : 0;
      if (liveA !== liveB) return liveB - liveA;

      const memeA = prioritaire && a.competitionId === prioritaire ? 1 : 0;
      const memeB = prioritaire && b.competitionId === prioritaire ? 1 : 0;
      if (memeA !== memeB) return memeB - memeA;

      return (
        interetDe(b.competitionId) - interetDe(a.competitionId) ||
        a.competition.localeCompare(b.competition)
      );
    });
}
