/**
 * L'adaptateur ESPN.
 *
 * ── Pourquoi ce fournisseur existe ──────────────────────────────────────────
 *
 * Sportmonks est la voie propre : données licenciées, contrat, support. Mais
 * son palier gratuit n'ouvre que quatre championnats — la Superliga danoise et
 * la Premiership écossaise — là où KZ TV commente la Ligue des Champions et la
 * Ligue 1. ESPN publie ces compétitions sans jeton, avec les statistiques, les
 * compositions, le classement et les noms de buteurs.
 *
 * C'est donc le fournisseur avec lequel on peut TESTER et DIFFUSER aujourd'hui.
 * Les deux coexistent derrière la même interface ; rien dans le rendu ne sait
 * lequel parle.
 *
 * ── Ce qu'il faut savoir avant de s'y fier en direct ────────────────────────
 *
 * L'API n'est pas documentée et n'est couverte par aucun engagement. Elle peut
 * changer de forme ou fermer sans préavis. La traduction est donc défensive
 * partout (tous les champs optionnels, aucune exception qui remonte), et
 * l'enregistreur garde les réponses brutes : le jour où la forme change, on
 * rejoue la capture et on corrige hors antenne.
 *
 * ── Les deux cadences ───────────────────────────────────────────────────────
 *
 * Le tableau de bord pèse ~15 Ko et porte le score, l'horloge et la période :
 * on l'interroge toutes les 10 secondes. Le résumé pèse ~475 Ko et porte les
 * statistiques et les compositions, qui bougent lentement : toutes les 30
 * secondes suffisent, et ça divise le trafic par trois.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { nouvelEtat, traduire } from './translate.js';
import { LIGUES } from './types.js';
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
/**
 * Ne garder du résumé que ce qui nous sert.
 *
 * Le résumé complet embarque les articles, les vidéos, les classements de
 * buteurs et les diffuseurs : 475 Ko, dont nous lisons moins d'un dixième.
 * Enregistré tel quel toutes les 30 secondes, un match ferait 85 Mo. On garde
 * les blocs que la traduction lit, PLUS le fil du match — il n'est pas encore
 * exploité, mais c'est la seule source possible d'une carte de pression, et
 * une capture qu'on n'a pas faite ne se refait pas.
 */
export function elaguer(s) {
    if (!s)
        return undefined;
    return {
        ...(s.boxscore ? { boxscore: s.boxscore } : {}),
        ...(s.rosters ? { rosters: s.rosters } : {}),
        ...(s.keyEvents ? { keyEvents: s.keyEvents } : {}),
        ...(s.standings ? { standings: s.standings } : {}),
        ...(s.odds ? { odds: s.odds } : {}),
        ...(s.commentary ? { commentary: s.commentary } : {}),
        ...(s.gameInfo ? { gameInfo: s.gameInfo } : {}),
    };
}
async function json(url) {
    const r = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(9_000),
    });
    if (!r.ok)
        throw new Error(`ESPN ${r.status} ${r.statusText}`);
    return (await r.json());
}
export async function tableauDeBord(ligue) {
    return json(`${BASE}/${ligue}/scoreboard`);
}
export async function resume(ligue, eventId) {
    return json(`${BASE}/${ligue}/summary?event=${encodeURIComponent(eventId)}`);
}
/** Les matchs en cours, tous championnats connus confondus. */
export async function matchsEnCours() {
    const resultats = await Promise.allSettled(Object.keys(LIGUES).map(async (ligue) => ({ ligue, bord: await tableauDeBord(ligue) })));
    const out = [];
    for (const r of resultats) {
        if (r.status !== 'fulfilled')
            continue;
        for (const e of r.value.bord.events ?? []) {
            const etat = (e.status ?? e.competitions?.[0]?.status)?.type?.state;
            if (etat === 'in') {
                out.push({ ligue: r.value.ligue, nom: LIGUES[r.value.ligue]?.nom ?? r.value.ligue, event: e });
            }
        }
    }
    return out;
}
export class EspnProvider {
    options;
    name = 'espn';
    timer = null;
    etat = nouvelEtat();
    eventId;
    dernierResume = 0;
    resumeEnCache;
    dernierAppel = null;
    derniereErreur = null;
    appels = 0;
    constructor(options) {
        this.options = options;
        this.eventId = options.eventId ?? null;
    }
    async start(sink, clock) {
        const interroger = async () => {
            try {
                const bord = await this.appelerBord();
                const tous = bord.events ?? [];
                // Sans match désigné, on prend le premier en cours : c'est ce qu'on
                // veut neuf fois sur dix quand on lance pendant une soirée.
                if (!this.eventId) {
                    const enCours = tous.find((e) => (e.status ?? e.competitions?.[0]?.status)?.type?.state === 'in');
                    this.eventId = enCours?.id ?? tous[0]?.id ?? null;
                }
                const event = tous.find((e) => e.id === this.eventId);
                if (!event) {
                    this.derniereErreur = `match ${this.eventId ?? '?'} absent du tableau de bord`;
                    return;
                }
                // Le résumé, plus rarement : il pèse vingt fois plus lourd.
                const maintenant = Date.now();
                if (maintenant - this.dernierResume >= (this.options.summaryMs ?? 30_000)) {
                    try {
                        this.resumeEnCache = elaguer(await this.appelerResume());
                        this.dernierResume = maintenant;
                    }
                    catch (erreur) {
                        // Un résumé manquant n'est pas grave : le tableau de bord porte
                        // déjà le score et l'horloge. On continue avec le précédent.
                        this.etat.lacunes.add(`résumé indisponible (${erreur instanceof Error ? erreur.message : String(erreur)})`);
                    }
                }
                const src = {
                    event,
                    ligue: this.options.ligue,
                    ...(this.resumeEnCache ? { summary: this.resumeEnCache } : {}),
                    ...(this.options.avecMultiplex
                        ? { autres: tous.filter((e) => e.id !== this.eventId) }
                        : {}),
                };
                if (this.options.recordTo)
                    this.enregistrer(src);
                const evenements = traduire(src, clock.now(), this.etat);
                this.derniereErreur = null;
                this.dernierAppel = clock.now();
                if (evenements.length > 0)
                    sink(evenements);
            }
            catch (erreur) {
                // Une erreur réseau ne coupe JAMAIS l'antenne : on note, on réessaie au
                // tour suivant, et l'overlay continue sur son dernier état.
                this.derniereErreur = erreur instanceof Error ? erreur.message : String(erreur);
            }
        };
        await interroger();
        this.timer = setInterval(() => void interroger(), this.options.pollMs ?? 10_000);
    }
    async stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
    }
    status() {
        const lacunes = [...this.etat.lacunes];
        const details = [
            `${this.appels} appels`,
            this.eventId ? `match ${this.eventId}` : 'aucun match choisi',
            lacunes.length > 0 ? `lacunes : ${lacunes.join(', ')}` : null,
            this.derniereErreur,
        ].filter(Boolean);
        return {
            name: `espn · ${LIGUES[this.options.ligue]?.nom ?? this.options.ligue}`,
            connected: this.derniereErreur === null && this.timer !== null,
            lastEventAt: this.dernierAppel,
            ...(details.length > 0 ? { detail: details.join(' — ') } : {}),
        };
    }
    /** Ce que la traduction n'a pas su lire. Vide, c'est bon signe. */
    get lacunes() {
        return [...this.etat.lacunes];
    }
    async appelerBord() {
        this.appels += 1;
        return tableauDeBord(this.options.ligue);
    }
    async appelerResume() {
        if (!this.eventId)
            throw new Error('aucun match choisi');
        this.appels += 1;
        return resume(this.options.ligue, this.eventId);
    }
    /** Une réponse par ligne : le fichier reste lisible et se rejoue en ordre. */
    enregistrer(src) {
        const chemin = resolve(process.cwd(), this.options.recordTo);
        try {
            mkdirSync(dirname(chemin), { recursive: true });
            appendFileSync(chemin, `${JSON.stringify({ at: Date.now(), src })}\n`);
        }
        catch (erreur) {
            console.warn('[kz] enregistrement impossible :', erreur);
        }
    }
}
/**
 * Capture une réponse unique et l'écrit, joliment formatée.
 *
 * C'est l'outil qui tranche les incertitudes : une seule réponse réelle montre
 * la forme exacte des faits, des statistiques et des compositions.
 */
export async function capturerUneFois(ligue, eventId, vers) {
    const bord = await tableauDeBord(ligue);
    const tous = bord.events ?? [];
    const event = tous.find((e) => e.id === eventId);
    const summary = await resume(ligue, eventId);
    const src = {
        ligue,
        ...(event ? { event } : {}),
        summary,
        autres: tous.filter((e) => e.id !== eventId),
    };
    const chemin = resolve(process.cwd(), vers);
    const texte = JSON.stringify(src, null, 2);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, texte);
    return { chemin, octets: texte.length, src };
}
export * from './translate.js';
export * from './types.js';
