/**
 * La traduction ESPN → notre modèle.
 *
 * Fonction PURE : pas de `Date.now()`, pas d'entrée/sortie, pas de hasard. On
 * lui donne une réponse et un instant, elle rend des événements. C'est ce qui
 * permet de la rejouer cinquante fois contre un fichier capturé jusqu'à ce
 * qu'elle soit juste, sans toucher au réseau.
 *
 * ── Les trois invariants ────────────────────────────────────────────────────
 *
 * 1. IDEMPOTENCE. ESPN renvoie l'état COMPLET à chaque appel. Sans mémoire des
 *    faits déjà émis, le même but arriverait toutes les dix secondes.
 * 2. LE SCORE VIENT DU FOURNISSEUR. On n'additionne jamais les buts soi-même :
 *    un but annulé par l'arbitrage vidéo ferait dériver le plateau pour le
 *    reste du match.
 * 3. PAS DE DONNÉE, PAS D'ÉVÉNEMENT. Jamais d'erreur, jamais de valeur
 *    inventée. Ce qu'on n'a pas su lire part dans `etat.lacunes`, et l'outil
 *    de capture l'affiche.
 *
 * ── Ce qui est meilleur ici que chez Sportmonks ─────────────────────────────
 *
 * ESPN horodate ses faits en temps RÉEL (`wallclock`). Quand on se branche sur
 * un match déjà commencé, les minutes affichées sont donc exactes au lieu
 * d'être toutes ramenées à l'instant du branchement.
 */
import { LIGUES, maillotDeviné, } from './types.js';
/** Le gris des équipes dont on ne connaît pas les couleurs. Voir `classement`. */
const GRIS_INCONNU = '#55606e';
export function nouvelEtat() {
    return {
        seq: 0,
        emis: new Set(),
        domicile: null,
        exterieur: null,
        coupDEnvoi: null,
        lacunes: new Set(),
        repertoire: new Map(),
        vuMeta: null,
        vuPhase: null,
        vuHorloge: null,
        vuScore: null,
        vuStats: null,
        vuCompo: { home: null, away: null },
        vuClassement: null,
        vuAutres: null,
        vuCotes: null,
    };
}
// ────────────────────────────────── Outils ──────────────────────────────────
function nombre(v) {
    if (typeof v === 'number' && Number.isFinite(v))
        return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n))
            return n;
    }
    return null;
}
function dernierMot(nom) {
    const parts = nom.trim().split(/\s+/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : nom;
}
function trigramme(nom) {
    const mots = nom.trim().split(/\s+/).filter(Boolean);
    if (mots.length >= 3)
        return mots.slice(0, 3).map((m) => m[0]).join('').toUpperCase();
    const base = (mots[0] ?? nom).replace(/[^A-Za-zÀ-ÿ]/g, '');
    return base.slice(0, 3).toUpperCase();
}
function couleur(hex) {
    if (!hex)
        return null;
    const h = hex.replace(/^#/, '').trim();
    return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h}` : null;
}
/** Le temps additionnel ne vit QUE dans `displayClock` : « 90'+4' ». */
export function tempsAdditionnel(displayClock) {
    const m = /\+\s*(\d+)/.exec(displayClock ?? '');
    return m ? Number(m[1]) : null;
}
/**
 * La période, lue sur `state` et `period` plutôt que sur `type.name`.
 *
 * L'énumération complète des `STATUS_*` est inconnue — c'est une API non
 * documentée. `state` ne vaut que « pre », « in » ou « post », et `period`
 * tranche le reste. On ne dépend donc d'aucune liste qu'on ne maîtrise pas.
 */
export function phaseDepuisEtat(st) {
    const nom = (st?.type?.name ?? '').toUpperCase();
    if (nom.includes('HALFTIME') || nom.includes('HALF_TIME'))
        return 'half_time';
    if (nom.includes('PENALT') || nom.includes('SHOOTOUT'))
        return 'penalties';
    if (nom.includes('FULL_TIME') || nom.includes('FINAL') || nom.includes('FT'))
        return 'full_time';
    const etat = st?.type?.state;
    if (etat === 'pre')
        return 'pre';
    if (etat === 'post')
        return 'full_time';
    switch (st?.period ?? 1) {
        case 1:
            return 'first_half';
        case 2:
            return 'second_half';
        case 3:
            return 'extra_first';
        case 4:
            return 'extra_second';
        case 5:
            return 'penalties';
        default:
            return 'second_half';
    }
}
/** Le score, tel que le fournisseur le donne. Jamais une addition de buts. */
export function lireScore(competitors) {
    let dom = null;
    let ext = null;
    for (const c of competitors ?? []) {
        const n = nombre(c.score);
        if (n === null)
            continue;
        if (c.homeAway === 'home')
            dom = n;
        else if (c.homeAway === 'away')
            ext = n;
    }
    return dom === null || ext === null ? null : [dom, ext];
}
function joueur(a) {
    if (!a)
        return undefined;
    const nom = a.fullName ?? a.displayName ?? a.shortName;
    if (!nom)
        return undefined;
    const poste = typeof a.position === 'string' ? a.position : a.position?.abbreviation;
    return {
        id: a.id ?? nom,
        name: nom,
        // ESPN donne « A. Koita » ; à l'antenne on veut « Koita », plus lisible en
        // gros. Le nom de famille quand il est là, le dernier mot sinon.
        short: a.lastName ?? dernierMot(nom),
        number: nombre(a.jersey) ?? 0,
        ...(poste ? { position: poste } : {}),
    };
}
function equipe(t, uniforme) {
    if (!t)
        return null;
    const nom = t.displayName ?? t.name ?? t.shortDisplayName;
    if (!nom)
        return null;
    const court = t.shortDisplayName ?? t.name ?? nom;
    const kit = maillotDeviné(nom);
    // Les couleurs du maillot porté ce jour-là passent devant celles du club :
    // c'est ce que le spectateur a sous les yeux.
    const principale = couleur(uniforme?.color) ?? couleur(t.color) ?? GRIS_INCONNU;
    const seconde = couleur(uniforme?.alternateColor) ?? couleur(t.alternateColor);
    return {
        id: t.id ?? nom,
        name: nom,
        short: court,
        abbr: t.abbreviation ?? trigramme(court),
        color: principale,
        ...(seconde ? { colorAlt: seconde } : {}),
        ...(kit ? { kit } : {}),
        // `crest` reste VIDE volontairement. ESPN sert de vrais écussons sur son
        // CDN, mais les embarquer veut dire une dépendance réseau en direct et des
        // logos qui ne nous appartiennent pas. Nos écus générés tiennent l'antenne.
    };
}
function bref(t) {
    return {
        abbr: t.abbr,
        short: t.short,
        color: t.color,
        ...(t.colorAlt ? { colorAlt: t.colorAlt } : {}),
        ...(t.kit ? { kit: t.kit } : {}),
    };
}
/**
 * Le score APRÈS un but, lu dans le texte rédigé par ESPN.
 *
 * « Goal! AEK Athens 1, Real Madrid 0. » — le fournisseur nous donne lui-même
 * le score à cet instant, ce qui respecte l'invariant n°2 même quand on
 * rattrape plusieurs buts d'un coup au premier appel.
 */
export function scoreDansLeTexte(texte, nomDom, nomExt) {
    const ech = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const direct = new RegExp(`${ech(nomDom)}\\s+(\\d+),\\s*${ech(nomExt)}\\s+(\\d+)`).exec(texte);
    if (direct)
        return [Number(direct[1]), Number(direct[2])];
    const inverse = new RegExp(`${ech(nomExt)}\\s+(\\d+),\\s*${ech(nomDom)}\\s+(\\d+)`).exec(texte);
    if (inverse)
        return [Number(inverse[2]), Number(inverse[1])];
    return null;
}
/** Cote américaine → cote décimale. -550 vaut 1.18 ; +250 vaut 3.50. */
export function americainVersDecimal(m) {
    if (!Number.isFinite(m) || m === 0)
        return null;
    return Math.round((m > 0 ? m / 100 + 1 : 100 / -m + 1) * 100) / 100;
}
/**
 * Les statistiques, avec leurs unités remises d'aplomb.
 *
 * ESPN mélange pourcentages et ratios dans le même tableau : `possessionPct`
 * vaut 30.4 mais `passPct` vaut 0.9. Afficher l'un pour l'autre donnerait
 * « 0,9 % de passes réussies » à l'antenne, et personne ne le remarquerait
 * avant le direct.
 */
export function statistiques(teams, etat) {
    if (!teams || teams.length === 0)
        return null;
    const parCamp = { home: new Map(), away: new Map() };
    let trouve = false;
    for (const t of teams) {
        const camp = t.homeAway === 'home' || t.team?.id === etat.domicile
            ? 'home'
            : t.homeAway === 'away' || t.team?.id === etat.exterieur
                ? 'away'
                : null;
        if (!camp)
            continue;
        for (const s of t.statistics ?? []) {
            const nom = s.name;
            const v = nombre(s.value) ?? nombre(s.displayValue);
            if (!nom || v === null)
                continue;
            parCamp[camp].set(nom, v);
            trouve = true;
        }
    }
    if (!trouve)
        return null;
    const paire = (nom, facteur = 1) => {
        const d = parCamp.home.get(nom);
        const e = parCamp.away.get(nom);
        if (d === undefined || e === undefined)
            return null;
        return [Math.round(d * facteur * 10) / 10, Math.round(e * facteur * 10) / 10];
    };
    const out = {};
    const poser = (cle, v) => {
        if (v)
            out[cle] = v;
    };
    poser('possession', paire('possessionPct')); // déjà en pourcentage
    poser('shots', paire('totalShots'));
    poser('shotsOnTarget', paire('shotsOnTarget'));
    poser('corners', paire('wonCorners'));
    poser('fouls', paire('foulsCommitted'));
    poser('offsides', paire('offsides'));
    poser('passes', paire('totalPasses'));
    poser('passAccuracy', paire('passPct', 100)); // ratio → pourcentage
    poser('yellowCards', paire('yellowCards'));
    poser('redCards', paire('redCards'));
    // ESPN ne publie pas d'`xG`. On ne le fabrique pas : une colonne vide est
    // honnête, une colonne inventée est un mensonge à l'antenne.
    if (!parCamp.home.has('expectedGoals'))
        etat.lacunes.add('xG absent (ESPN ne le publie pas)');
    return Object.keys(out).length > 0 ? out : null;
}
function compo(r, camp) {
    const lignes = r.roster ?? [];
    if (lignes.length === 0)
        return null;
    const place = (e) => nombre(e.formationPlace) ?? 999;
    const titulaires = lignes
        .filter((e) => e.starter)
        .sort((a, b) => place(a) - place(b))
        .map((e) => joueur({ ...e.athlete, jersey: e.jersey ?? e.athlete?.jersey, position: e.position }))
        .filter((p) => p !== undefined);
    const banc = lignes
        .filter((e) => !e.starter)
        .map((e) => joueur({ ...e.athlete, jersey: e.jersey ?? e.athlete?.jersey, position: e.position }))
        .filter((p) => p !== undefined);
    if (titulaires.length === 0)
        return null;
    return {
        side: camp,
        // ESPN calcule la formation lui-même. On ne la déduit pas des lignes, donc
        // on ne peut pas se tromper dessus.
        formation: r.formation ?? '',
        starters: titulaires,
        bench: banc,
        // ESPN ne donne pas l'entraîneur dans ce bloc.
    };
}
function classement(st, etat) {
    const groupes = st?.groups ?? [];
    const entrees = groupes.flatMap((g) => g.standings?.entries ?? []);
    if (entrees.length === 0)
        return null;
    let inconnues = 0;
    const lignes = [];
    for (const e of entrees) {
        const nom = e.team;
        if (!nom)
            continue;
        const stat = (n) => {
            for (const s of e.stats ?? [])
                if (s.name === n)
                    return nombre(s.value) ?? nombre(s.displayValue);
            return null;
        };
        // Le classement d'ESPN ne porte PAS les couleurs : il donne un nom et un
        // identifiant. On réutilise ce qu'on a glané sur les équipes croisées dans
        // la soirée, et le reste reste gris — un gris franc, le même pour toutes,
        // plutôt que des couleurs plausibles et fausses.
        const connue = e.id ? etat.repertoire.get(e.id) : undefined;
        if (!connue)
            inconnues += 1;
        lignes.push({
            rank: stat('rank') ?? lignes.length + 1,
            team: connue ?? { abbr: trigramme(nom), short: nom, color: GRIS_INCONNU },
            played: stat('gamesPlayed') ?? 0,
            diff: stat('pointDifferential') ?? 0,
            points: stat('points') ?? 0,
            zone: null,
        });
    }
    if (lignes.length === 0)
        return null;
    lignes.sort((a, b) => a.rank - b.rank);
    if (inconnues > 0) {
        etat.lacunes.add(`couleurs inconnues pour ${inconnues} équipe(s) du classement`);
    }
    return lignes;
}
function cotes(liste) {
    const o = liste?.[0];
    if (!o)
        return null;
    const dom = o.homeTeamOdds?.moneyLine;
    const ext = o.awayTeamOdds?.moneyLine;
    const nul = o.drawOdds?.moneyLine ?? o.drawOdds?.value;
    if (dom === undefined || ext === undefined || nul === undefined)
        return null;
    const d = americainVersDecimal(dom);
    const e = americainVersDecimal(ext);
    const n = americainVersDecimal(nul);
    if (d === null || e === null || n === null)
        return null;
    return { home: d, draw: n, away: e, ...(o.provider?.name ? { bookmaker: o.provider.name } : {}) };
}
/** La minute d'antenne d'un autre match : « 69 », « 45+2 », « MT », « FT ». */
export function minuteAffichee(st) {
    const phase = phaseDepuisEtat(st);
    if (phase === 'half_time')
        return 'MT';
    if (phase === 'full_time')
        return 'FT';
    if (phase === 'pre')
        return '—';
    const brut = (st?.displayClock ?? '').replace(/'/g, '').trim();
    if (brut)
        return brut;
    const sec = nombre(st?.clock);
    return sec === null ? '—' : String(Math.floor(sec / 60));
}
/**
 * La clé d'idempotence d'un fait.
 *
 * Les `keyEvents` du résumé ont un identifiant stable : on le prend. Les
 * `details` du tableau de bord n'en ont AUCUN — il faut donc fabriquer une clé
 * à partir de ce qui ne bouge pas : le type, la minute, l'équipe, le joueur.
 */
export function cleDuFait(f) {
    if ('id' in f && f.id)
        return `k:${f.id}`;
    const t = f.type?.id ?? f.type?.text ?? '?';
    const c = f.clock?.value ?? f.clock?.displayValue ?? '?';
    const eq = f.team?.id ?? '?';
    const qui = 'athletesInvolved' in f
        ? (f.athletesInvolved ?? []).map((a) => a.id ?? '').join('.')
        : (('participants' in f ? f.participants : undefined) ?? []).map((p) => p.athlete?.id ?? '').join('.');
    return `d:${t}:${c}:${eq}:${qui}`;
}
// ──────────────────────────────── La traduction ──────────────────────────────
export function traduire(src, now, etat) {
    const out = [];
    const emettre = (kind, t, payload) => {
        out.push({ seq: etat.seq++, t, kind, payload });
    };
    const ev = src.event;
    const comp = ev?.competitions?.[0];
    const statut = ev?.status ?? comp?.status;
    // ── Les équipes, et de quel côté elles jouent ─────────────────────────────
    const dom = (comp?.competitors ?? []).find((c) => c.homeAway === 'home');
    const ext = (comp?.competitors ?? []).find((c) => c.homeAway === 'away');
    const uniformes = new Map();
    for (const r of src.summary?.rosters ?? []) {
        if (r.team?.id && r.uniform)
            uniformes.set(r.team.id, r.uniform);
    }
    const eqDom = equipe(dom?.team, dom?.team?.id ? uniformes.get(dom.team.id) : undefined);
    const eqExt = equipe(ext?.team, ext?.team?.id ? uniformes.get(ext.team.id) : undefined);
    if (dom?.team?.id)
        etat.domicile = dom.team.id;
    if (ext?.team?.id)
        etat.exterieur = ext.team.id;
    if (!dom || !ext) {
        // `homeAway` est la seule source de vérité sur le côté. Sans lui on
        // n'invente pas : un plateau qui inverse les équipes est pire qu'un
        // plateau vide.
        if (ev)
            etat.lacunes.add('« homeAway » absent : impossible de trancher domicile/extérieur');
    }
    // On enrichit le répertoire avec TOUTES les équipes croisées — celles de la
    // soirée servent à colorer le classement.
    const noter = (t) => {
        const e = equipe(t);
        if (e && t?.id)
            etat.repertoire.set(t.id, bref(e));
    };
    noter(dom?.team);
    noter(ext?.team);
    for (const a of src.autres ?? []) {
        for (const c of a.competitions?.[0]?.competitors ?? [])
            noter(c.team);
    }
    // ── Le coup d'envoi réel, qui sert à situer les faits sans `wallclock` ────
    for (const k of src.summary?.keyEvents ?? []) {
        if ((k.type?.type === 'kickoff' || k.type?.id === '80') && k.wallclock) {
            const t = Date.parse(k.wallclock);
            if (Number.isFinite(t))
                etat.coupDEnvoi = t;
        }
    }
    if (etat.coupDEnvoi === null && ev?.date) {
        const t = Date.parse(ev.date);
        if (Number.isFinite(t))
            etat.coupDEnvoi = t;
    }
    /** L'instant réel d'un fait : le `wallclock` d'ESPN, sinon le chrono. */
    const quand = (f) => {
        if ('wallclock' in f && f.wallclock) {
            const t = Date.parse(f.wallclock);
            if (Number.isFinite(t))
                return t;
        }
        const sec = nombre(f.clock?.value);
        if (sec !== null && etat.coupDEnvoi !== null)
            return etat.coupDEnvoi + sec * 1000;
        return now;
    };
    const coteDe = (id) => id && id === etat.domicile ? 'home' : id && id === etat.exterieur ? 'away' : null;
    // ── meta ──────────────────────────────────────────────────────────────────
    if (eqDom && eqExt) {
        const ligue = src.ligue ? LIGUES[src.ligue] : undefined;
        const meta = {
            id: ev?.id ?? `${eqDom.id}-${eqExt.id}`,
            competition: ligue?.nom ?? src.ligue ?? 'Football',
            competitionTheme: ligue?.theme ?? 'kztv',
            home: eqDom,
            away: eqExt,
            kickoff: etat.coupDEnvoi ?? now,
            ...(comp?.notes?.[0]?.headline ? { round: comp.notes[0].headline } : {}),
            ...(ev?.venue?.fullName ?? comp?.venue?.fullName
                ? { venue: (ev?.venue?.fullName ?? comp?.venue?.fullName) }
                : {}),
        };
        const signature = JSON.stringify(meta);
        if (signature !== etat.vuMeta) {
            etat.vuMeta = signature;
            emettre('meta', now, meta);
        }
    }
    // ── phase et horloge ──────────────────────────────────────────────────────
    if (statut) {
        const phase = phaseDepuisEtat(statut);
        if (phase !== etat.vuPhase) {
            etat.vuPhase = phase;
            emettre('phase', now, { phase });
        }
        const sec = nombre(statut.clock);
        if (sec !== null) {
            const ajout = tempsAdditionnel(statut.displayClock);
            const tourne = statut.type?.state === 'in' && phase !== 'half_time';
            const ancre = {
                matchMs: sec * 1000,
                running: tourne,
                phase,
                ...(ajout !== null ? { addedMinutes: ajout } : {}),
            };
            const signature = JSON.stringify(ancre);
            if (signature !== etat.vuHorloge) {
                etat.vuHorloge = signature;
                emettre('clock', now, ancre);
            }
        }
        else if (statut.type?.state === 'in') {
            etat.lacunes.add('match en cours mais « clock » absent');
        }
    }
    // ── score ─────────────────────────────────────────────────────────────────
    const score = lireScore(comp?.competitors);
    if (score) {
        const signature = `${score[0]}-${score[1]}`;
        if (signature !== etat.vuScore) {
            etat.vuScore = signature;
            emettre('score', now, { score });
        }
    }
    // ── les faits ─────────────────────────────────────────────────────────────
    // On préfère les `keyEvents` du résumé : identifiant stable, nom du buteur,
    // texte rédigé, instant réel. Les `details` du tableau de bord servent de
    // filet quand le résumé n'a pas été chargé à ce tour.
    const faits = [
        ...(src.summary?.keyEvents ?? []),
        ...(comp?.details ?? []),
    ];
    for (const f of faits) {
        const cle = cleDuFait(f);
        if (etat.emis.has(cle))
            continue;
        const slug = f.type?.type ?? '';
        const texte = ('text' in f ? f.text : undefined) ?? '';
        const libelle = (f.type?.text ?? '').toLowerCase();
        const camp = coteDe(f.team?.id);
        const t = quand(f);
        const athletes = ('athletesInvolved' in f
            ? (f.athletesInvolved ?? []).map((a) => joueur(a))
            : (('participants' in f ? f.participants : undefined) ?? []).map((p) => joueur(p.athlete))).filter((p) => p !== undefined);
        // ── un but ──────────────────────────────────────────────────────────────
        // Piloté par les DRAPEAUX, pas par `type.id` : six identifiants différents
        // désignent déjà un but, et rien n'interdit un septième demain.
        const estBut = f.scoringPlay === true || slug === 'goal' || /goal/.test(libelle);
        const csc = ('ownGoal' in f ? f.ownGoal : undefined) === true || /own goal/.test(libelle);
        const penalty = ('penaltyKick' in f ? f.penaltyKick : undefined) === true || /penalty/.test(libelle);
        if (estBut && camp) {
            etat.emis.add(cle);
            // Le score au moment du but : d'abord celui qu'ESPN écrit dans son
            // propre texte, sinon le score courant. Jamais une addition.
            const dansTexte = texte && eqDom && eqExt ? scoreDansLeTexte(texte, eqDom.name, eqExt.name) : null;
            const apres = dansTexte ?? score;
            if (!dansTexte && score)
                etat.lacunes.add('score d’un but repris du score courant');
            if (!apres)
                continue;
            emettre('goal', t, {
                side: camp,
                score: apres,
                ...(athletes[0] ? { scorer: athletes[0] } : {}),
                ...(athletes[1] ? { assist: athletes[1] } : {}),
                ...(csc ? { ownGoal: true } : {}),
                ...(penalty ? { penalty: true } : {}),
            });
            continue;
        }
        // ── un carton ───────────────────────────────────────────────────────────
        const rouge = ('redCard' in f ? f.redCard : undefined) === true || slug === 'red-card';
        const jaune = ('yellowCard' in f ? f.yellowCard : undefined) === true || slug === 'yellow-card';
        if ((rouge || jaune) && camp) {
            etat.emis.add(cle);
            emettre('card', t, {
                side: camp,
                card: rouge ? 'red' : 'yellow',
                ...(athletes[0] ? { player: athletes[0] } : {}),
            });
            continue;
        }
        // ── un remplacement ─────────────────────────────────────────────────────
        if (slug === 'substitution' || /substitution/.test(libelle)) {
            if (!camp)
                continue;
            etat.emis.add(cle);
            emettre('substitution', t, {
                side: camp,
                ...(athletes[0] ? { in: athletes[0] } : {}),
                ...(athletes[1] ? { out: athletes[1] } : {}),
            });
            continue;
        }
        // Les coups d'envoi, mi-temps, arrêts de jeu : la phase et l'horloge les
        // portent déjà. On les marque comme vus pour ne pas les réexaminer.
        if (/kickoff|halftime|start-|end-|delay/.test(slug)) {
            etat.emis.add(cle);
            continue;
        }
        // Un type qu'on ne connaît pas. On ne devine pas, on le signale.
        if (slug || libelle)
            etat.lacunes.add(`type de fait non traduit : ${slug || libelle}`);
        etat.emis.add(cle);
    }
    // ── statistiques ──────────────────────────────────────────────────────────
    const stats = statistiques(src.summary?.boxscore?.teams, etat);
    if (stats) {
        const signature = JSON.stringify(stats);
        if (signature !== etat.vuStats) {
            etat.vuStats = signature;
            emettre('stats', now, stats);
        }
    }
    // ── compositions ──────────────────────────────────────────────────────────
    for (const r of src.summary?.rosters ?? []) {
        const camp = r.homeAway === 'home' || r.team?.id === etat.domicile
            ? 'home'
            : r.homeAway === 'away' || r.team?.id === etat.exterieur
                ? 'away'
                : null;
        if (!camp)
            continue;
        const c = compo(r, camp);
        if (!c)
            continue;
        if (!c.formation)
            etat.lacunes.add('formation absente du résumé');
        const signature = JSON.stringify(c);
        if (signature !== etat.vuCompo[camp]) {
            etat.vuCompo[camp] = signature;
            emettre('lineup', now, c);
        }
    }
    // ── classement ────────────────────────────────────────────────────────────
    const rangs = classement(src.summary?.standings, etat);
    if (rangs) {
        const signature = JSON.stringify(rangs);
        if (signature !== etat.vuClassement) {
            etat.vuClassement = signature;
            emettre('standings', now, { rows: rangs });
        }
    }
    // ── les autres matchs ─────────────────────────────────────────────────────
    if (src.autres && src.autres.length > 0) {
        const matches = [];
        for (const a of src.autres) {
            const c = a.competitions?.[0];
            const d = (c?.competitors ?? []).find((x) => x.homeAway === 'home');
            const e = (c?.competitors ?? []).find((x) => x.homeAway === 'away');
            const ed = equipe(d?.team);
            const ee = equipe(e?.team);
            const sc = lireScore(c?.competitors);
            if (!ed || !ee || !sc)
                continue;
            const st = a.status ?? c?.status;
            matches.push({
                id: a.id ?? `${ed.id}-${ee.id}`,
                minute: minuteAffichee(st),
                live: st?.type?.state === 'in',
                home: bref(ed),
                away: bref(ee),
                score: sc,
            });
        }
        if (matches.length > 0) {
            const signature = JSON.stringify(matches);
            if (signature !== etat.vuAutres) {
                etat.vuAutres = signature;
                emettre('other_matches', now, { matches });
            }
        }
    }
    // ── cotes ─────────────────────────────────────────────────────────────────
    const c1n2 = cotes(src.summary?.odds ?? comp?.odds);
    if (c1n2) {
        const signature = JSON.stringify(c1n2);
        if (signature !== etat.vuCotes) {
            etat.vuCotes = signature;
            emettre('odds', now, c1n2);
        }
    }
    // ESPN ne donne aucune position de ballon. Le radar n'a donc pas de source
    // ici — il attend un palier payant ailleurs, ou se transforme en carte de
    // pression dérivée du fil du match.
    if (src.summary)
        etat.lacunes.add('position du ballon absente (ESPN n’en publie pas)');
    out.sort((a, b) => a.t - b.t || a.seq - b.seq);
    return out;
}
