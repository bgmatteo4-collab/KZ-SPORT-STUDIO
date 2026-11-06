/**
 * La traduction Sportmonks → modèle interne.
 *
 * Fonction PURE, séparée de la boucle réseau : c'est ce qui permet de la
 * tester contre une réponse enregistrée, sans jeton et sans match en cours.
 *
 * ── Trois contraintes qui dictent l'écriture ─────────────────────────────────
 *
 * 1. IDEMPOTENTE. On interroge l'API toutes les dix secondes et elle renvoie à
 *    chaque fois l'état COMPLET du match. Il faut donc n'émettre que les
 *    nouveautés, sinon le même but arriverait cinquante fois. Les clés
 *    d'émission dérivent des identifiants Sportmonks, qui sont stables.
 *
 * 2. TOLÉRANTE. Trois points ne sont pas documentés : où vit « domicile /
 *    extérieur », la forme exacte de `scores`, et la clé interne de
 *    `statistics[].data`. On essaie plusieurs emplacements plutôt que de
 *    parier, et on signale ce qu'on n'a pas su lire.
 *
 * 3. ELLE NE COMPTE RIEN. Le score vient du fournisseur, jamais d'une
 *    addition de buts — un but annulé par la VAR créerait sinon un écart
 *    définitif.
 */
import { TYPE_EVENEMENT, TYPE_STAT, } from './types.js';
export function nouvelEtat() {
    return {
        seq: 0,
        emis: new Set(),
        domicile: null,
        exterieur: null,
        derniereHorloge: '',
        dernierePhase: null,
        dernierScore: '',
        dernieresStats: '',
        derniereBalle: '',
        compositionsEmises: new Set(),
        metaEmise: false,
        lacunes: new Set(),
    };
}
// ──────────────────────────── Lecteurs tolérants ────────────────────────────
/** INCERTAIN dans la doc : on essaie les deux emplacements connus. */
function localisation(p) {
    return String(p.meta?.location ?? p.location ?? '').toLowerCase();
}
/** INCERTAIN : `data` peut être un objet `{ value }` ou un nombre nu. */
function valeurStat(s) {
    const d = s.data;
    if (typeof d === 'number')
        return d;
    if (d && typeof d === 'object' && typeof d.value === 'number')
        return d.value;
    return null;
}
function nombre(v) {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : null;
}
/**
 * La phase, déduite du libellé d'état plutôt que d'identifiants numériques :
 * les `state_id` ne sont documentés nulle part, les libellés le sont.
 */
export function phaseDepuisEtat(etat) {
    const e = (etat ?? '').toUpperCase();
    if (e.includes('PEN'))
        return 'penalties';
    if (e.includes('ET_HT') || e.includes('EXTRA_TIME_BREAK'))
        return 'extra_half';
    if (e.includes('2ND_EXTRA') || e.includes('ET_2'))
        return 'extra_second';
    if (e.includes('EXTRA') || e.includes('ET'))
        return 'extra_first';
    if (e.includes('HT') || e.includes('HALF_TIME') || e.includes('BREAK'))
        return 'half_time';
    if (e.includes('2ND_HALF') || e.includes('2ND'))
        return 'second_half';
    if (e.includes('1ST_HALF') || e.includes('1ST'))
        return 'first_half';
    if (e.includes('FT') || e.includes('FINISH') || e.includes('AET'))
        return 'full_time';
    return 'pre';
}
/**
 * Le score. On lit d'abord `scores`, puis, à défaut, le champ `result` du
 * dernier but — qui est documenté comme portant le score APRÈS l'événement.
 */
export function lireScore(fixture, domicile, exterieur) {
    const scores = fixture.scores ?? [];
    const courant = scores.filter((s) => {
        const d = (s.description ?? '').toUpperCase();
        return d === 'CURRENT' || d === '' || d.includes('CURRENT');
    });
    const source = courant.length > 0 ? courant : scores;
    let dom = null;
    let ext = null;
    for (const s of source) {
        const buts = nombre(s.score?.goals);
        if (buts === null)
            continue;
        const cote = (s.score?.participant ?? '').toLowerCase();
        if (cote === 'home' || s.participant_id === domicile)
            dom = buts;
        else if (cote === 'away' || s.participant_id === exterieur)
            ext = buts;
    }
    if (dom !== null && ext !== null)
        return [dom, ext];
    // Repli : le dernier événement de type but porte « 2-1 ».
    const buts = (fixture.events ?? [])
        .filter((e) => estBut(e) && typeof e.result === 'string')
        .sort((a, b) => (a.sort_order ?? a.id ?? 0) - (b.sort_order ?? b.id ?? 0));
    const dernier = buts[buts.length - 1];
    if (dernier?.result) {
        const m = /^(\d+)\s*[-–:]\s*(\d+)$/.exec(dernier.result.trim());
        if (m)
            return [Number(m[1]), Number(m[2])];
    }
    return null;
}
function estBut(e) {
    return (e.type_id === TYPE_EVENEMENT.BUT ||
        e.type_id === TYPE_EVENEMENT.CSC ||
        e.type_id === TYPE_EVENEMENT.PENALTY);
}
function equipeDepuis(p, repli) {
    const nom = p?.name ?? repli;
    return {
        id: String(p?.id ?? repli),
        name: nom,
        short: nom,
        abbr: (p?.short_code ?? nom.slice(0, 3)).toUpperCase().slice(0, 4),
        color: '#6b7280',
        ...(p?.image_path ? { crest: p.image_path } : {}),
    };
}
function joueur(id, nom, numero = 0) {
    if (!nom)
        return undefined;
    const court = nom.split(' ').pop() ?? nom;
    return { id: String(id ?? nom), name: nom, short: court, number: numero };
}
// ─────────────────────────────── La traduction ──────────────────────────────
/**
 * Traduit une réponse en événements NOUVEAUX.
 *
 * `now` est l'instant de réception, en temps mural. Sportmonks ne donne pas
 * d'horodatage par événement : on prend donc l'heure de réception et on
 * l'assume — c'est exactement ce que fait un scoreur devant sa télévision, et
 * c'est sans conséquence puisque le décalage anti-spoiler absorbe la seconde
 * près.
 */
export function traduire(fixture, now, etat) {
    const sortie = [];
    const pousser = (kind, payload) => {
        sortie.push({ seq: etat.seq++, t: now, kind, payload });
    };
    // ── Qui joue à domicile ? Tout en dépend. ──
    const participants = fixture.participants ?? [];
    if (etat.domicile === null || etat.exterieur === null) {
        const dom = participants.find((p) => localisation(p) === 'home');
        const ext = participants.find((p) => localisation(p) === 'away');
        if (dom?.id && ext?.id) {
            etat.domicile = dom.id;
            etat.exterieur = ext.id;
        }
        else if (participants.length === 2) {
            // La localisation n'a pas été trouvée : Sportmonks liste le domicile en
            // premier. On l'assume, et on le SIGNALE — un plateau qui inverse les
            // équipes est pire qu'un plateau vide.
            etat.lacunes.add('domicile/extérieur déduits de l’ordre des participants');
            etat.domicile = participants[0]?.id ?? null;
            etat.exterieur = participants[1]?.id ?? null;
        }
    }
    const pDom = participants.find((p) => p.id === etat.domicile);
    const pExt = participants.find((p) => p.id === etat.exterieur);
    const cote = (participantId) => participantId === etat.domicile ? 'home' : participantId === etat.exterieur ? 'away' : null;
    // ── Les métadonnées, une seule fois. ──
    if (!etat.metaEmise && pDom && pExt) {
        etat.metaEmise = true;
        const depart = fixture.starting_at_timestamp
            ? fixture.starting_at_timestamp * 1000
            : fixture.starting_at
                ? Date.parse(`${fixture.starting_at.replace(' ', 'T')}Z`)
                : now;
        pousser('meta', {
            id: String(fixture.id ?? 'sportmonks'),
            competition: fixture.league?.name ?? 'Football',
            competitionTheme: 'kztv',
            ...(fixture.round?.name ? { round: fixture.round.name } : {}),
            ...(fixture.venue?.name ? { venue: fixture.venue.name } : {}),
            home: equipeDepuis(pDom, 'Domicile'),
            away: equipeDepuis(pExt, 'Extérieur'),
            kickoff: Number.isFinite(depart) ? depart : now,
        });
    }
    // ── La phase. ──
    const phase = phaseDepuisEtat(fixture.state?.state ?? fixture.state?.name);
    if (phase !== etat.dernierePhase) {
        etat.dernierePhase = phase;
        pousser('phase', { phase });
    }
    // ── L'horloge. On n'émet un ancrage que s'il a bougé. ──
    const periodes = fixture.periods ?? [];
    const active = periodes.find((p) => p.ticking) ?? periodes[periodes.length - 1];
    if (active) {
        const minutes = active.minutes ?? 0;
        const secondes = active.seconds ?? 0;
        const matchMs = minutes * 60_000 + secondes * 1_000;
        const ajout = active.time_added ?? undefined;
        const signature = `${matchMs}|${active.ticking}|${phase}|${ajout}`;
        if (signature !== etat.derniereHorloge) {
            etat.derniereHorloge = signature;
            pousser('clock', {
                matchMs,
                running: active.ticking === true,
                phase,
                ...(typeof ajout === 'number' ? { addedMinutes: ajout } : {}),
            });
        }
    }
    // ── Le score, tel que le fournisseur le donne. ──
    const score = lireScore(fixture, etat.domicile, etat.exterieur);
    if (score) {
        const signature = `${score[0]}-${score[1]}`;
        if (signature !== etat.dernierScore) {
            etat.dernierScore = signature;
            pousser('score', { score });
        }
    }
    else if ((fixture.scores ?? []).length > 0) {
        etat.lacunes.add('score illisible dans `scores`');
    }
    // ── Les faits de jeu. Clé = identifiant Sportmonks, donc stable. ──
    const evenements = [...(fixture.events ?? [])].sort((a, b) => (a.sort_order ?? a.id ?? 0) - (b.sort_order ?? b.id ?? 0));
    for (const e of evenements) {
        const cle = `ev:${e.id ?? `${e.type_id}:${e.minute}:${e.player_id}`}`;
        if (etat.emis.has(cle))
            continue;
        const side = cote(e.participant_id);
        if (!side)
            continue;
        etat.emis.add(cle);
        if (estBut(e)) {
            const apres = score ?? [0, 0];
            pousser('goal', {
                side,
                ...(joueur(e.player_id, e.player_name) ? { scorer: joueur(e.player_id, e.player_name) } : {}),
                ...(joueur(e.related_player_id, e.related_player_name)
                    ? { assist: joueur(e.related_player_id, e.related_player_name) }
                    : {}),
                ...(e.type_id === TYPE_EVENEMENT.CSC ? { ownGoal: true } : {}),
                ...(e.type_id === TYPE_EVENEMENT.PENALTY ? { penalty: true } : {}),
                score: apres,
            });
        }
        else if (e.type_id === TYPE_EVENEMENT.JAUNE) {
            pousser('card', { side, ...(joueur(e.player_id, e.player_name) ? { player: joueur(e.player_id, e.player_name) } : {}), card: 'yellow' });
        }
        else if (e.type_id === TYPE_EVENEMENT.ROUGE) {
            pousser('card', { side, ...(joueur(e.player_id, e.player_name) ? { player: joueur(e.player_id, e.player_name) } : {}), card: 'red' });
        }
        else if (e.type_id === TYPE_EVENEMENT.JAUNE_ROUGE) {
            pousser('card', { side, ...(joueur(e.player_id, e.player_name) ? { player: joueur(e.player_id, e.player_name) } : {}), card: 'second_yellow' });
        }
        else if (e.type_id === TYPE_EVENEMENT.REMPLACEMENT) {
            // Sportmonks met l'ENTRANT dans `player_name` et le sortant dans
            // `related_player_name`.
            pousser('substitution', {
                side,
                ...(joueur(e.player_id, e.player_name) ? { in: joueur(e.player_id, e.player_name) } : {}),
                ...(joueur(e.related_player_id, e.related_player_name)
                    ? { out: joueur(e.related_player_id, e.related_player_name) }
                    : {}),
            });
        }
    }
    // ── Les statistiques. ──
    const stats = traduireStats(fixture.statistics ?? [], etat);
    if (stats) {
        const signature = JSON.stringify(stats);
        if (signature !== etat.dernieresStats) {
            etat.dernieresStats = signature;
            pousser('stats', stats);
        }
    }
    // ── Les compositions, une fois par camp. ──
    for (const [side, participant] of [['home', pDom], ['away', pExt]]) {
        if (etat.compositionsEmises.has(side) || !participant?.id)
            continue;
        const lignes = (fixture.lineups ?? []).filter((l) => l.team_id === participant.id);
        if (lignes.length === 0)
            continue;
        etat.compositionsEmises.add(side);
        pousser('lineup', traduireComposition(side, lignes));
    }
    // ── La position du ballon, si le palier y donne droit. ──
    const balles = fixture.ballCoordinates ?? [];
    const derniere = balles[balles.length - 1];
    if (derniere) {
        const x = nombre(derniere.x);
        const y = nombre(derniere.y);
        if (x !== null && y !== null) {
            const signature = `${x},${y},${derniere.timer ?? ''}`;
            if (signature !== etat.derniereBalle) {
                etat.derniereBalle = signature;
                // Sportmonks donne des coordonnées en pourcentage du terrain ; le
                // modèle interne les veut dans [0,1].
                pousser('ball', { x: borne(x > 1 ? x / 100 : x), y: borne(y > 1 ? y / 100 : y) });
            }
        }
    }
    return sortie;
}
const borne = (v) => Math.min(1, Math.max(0, v));
function traduireStats(stats, etat) {
    if (stats.length === 0)
        return null;
    const paire = (typeId) => {
        const concernees = stats.filter((s) => s.type_id === typeId);
        if (concernees.length === 0)
            return null;
        let dom = null;
        let ext = null;
        for (const s of concernees) {
            const v = valeurStat(s);
            if (v === null)
                continue;
            const ou = (s.location ?? '').toLowerCase();
            if (ou === 'home' || s.participant_id === etat.domicile)
                dom = v;
            else if (ou === 'away' || s.participant_id === etat.exterieur)
                ext = v;
        }
        if (dom === null && ext === null) {
            etat.lacunes.add(`statistique ${typeId} illisible`);
            return null;
        }
        return [dom ?? 0, ext ?? 0];
    };
    const sortie = {};
    const table = [
        ['possession', TYPE_STAT.POSSESSION],
        ['shots', TYPE_STAT.TIRS],
        ['shotsOnTarget', TYPE_STAT.TIRS_CADRES],
        ['corners', TYPE_STAT.CORNERS],
        ['fouls', TYPE_STAT.FAUTES],
        ['offsides', TYPE_STAT.HORS_JEU],
        ['passes', TYPE_STAT.PASSES],
    ];
    for (const [nom, typeId] of table) {
        const p = paire(typeId);
        if (p)
            sortie[nom] = p;
    }
    return Object.keys(sortie).length > 0 ? sortie : null;
}
/**
 * INCERTAIN : la signification de `type_id` sur une ligne de composition
 * (titulaire contre remplaçant) n'est pas documentée. On se rabat sur
 * `formation_field`, qui n'est rempli que pour les titulaires.
 */
function traduireComposition(side, lignes) {
    const nom = (l) => l.player?.display_name ?? l.player?.name ?? l.player_name ?? 'Joueur';
    const vers = (l) => ({
        id: String(l.player_id ?? nom(l)),
        name: nom(l),
        short: nom(l).split(' ').pop() ?? nom(l),
        number: l.jersey_number ?? 0,
    });
    const titulaires = lignes.filter((l) => l.formation_field != null);
    const banc = lignes.filter((l) => l.formation_field == null);
    // La formation se déduit du nombre de joueurs par ligne : `formation_field`
    // vaut « 1:1 », « 2:3 »… la première partie étant la ligne.
    const parLigne = new Map();
    for (const l of titulaires) {
        const ligne = String(l.formation_field).split(':')[0] ?? '?';
        parLigne.set(ligne, (parLigne.get(ligne) ?? 0) + 1);
    }
    const lignesTriees = [...parLigne.entries()]
        .filter(([k]) => k !== '1')
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, n]) => n);
    return {
        side,
        formation: lignesTriees.length > 0 ? lignesTriees.join('-') : '4-3-3',
        starters: (titulaires.length > 0 ? titulaires : lignes.slice(0, 11)).map(vers),
        bench: banc.map(vers),
    };
}
