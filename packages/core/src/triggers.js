/**
 * Les déclenchements d'animation.
 *
 * Problème : l'état est une fonction pure du temps. Alors comment fait-on jaillir
 * un carton plein écran au moment du but ?
 *
 * Réponse : on ne lit pas « il y a un but », on détecte qu'un fait VIENT
 * D'ENTRER dans le champ visible. Le chrono avançant image par image, un but
 * franchit la frontière du visible une seule fois.
 *
 * Corollaire indispensable : après un rechargement ou un changement de délai,
 * tout le passé entre d'un coup dans le champ visible. Il ne faut RIEN
 * déclencher dans ce cas — sinon on rejoue les six buts du match à l'antenne.
 * C'est le rôle de `prime()`.
 */
export class TriggerWatcher {
    seen = new Set();
    phase = null;
    /**
     * Marque tout l'état courant comme déjà vu, sans rien déclencher.
     * À appeler après un rechargement, un changement de délai, ou tout saut
     * volontaire dans le temps.
     */
    prime(state) {
        this.seen.clear();
        for (const g of state.goals)
            this.seen.add(`goal:${g.seq}`);
        for (const c of state.cards)
            this.seen.add(`card:${c.seq}`);
        for (const s of state.subs)
            this.seen.add(`sub:${s.seq}`);
        this.phase = state.phase;
    }
    /** Les faits entrés dans le champ visible depuis le dernier appel. */
    poll(state) {
        const out = [];
        for (const entry of state.goals) {
            const key = `goal:${entry.seq}`;
            if (this.seen.has(key))
                continue;
            this.seen.add(key);
            out.push({ kind: 'goal', entry });
        }
        for (const entry of state.cards) {
            const key = `card:${entry.seq}`;
            if (this.seen.has(key))
                continue;
            this.seen.add(key);
            out.push({ kind: 'card', entry });
        }
        for (const entry of state.subs) {
            const key = `sub:${entry.seq}`;
            if (this.seen.has(key))
                continue;
            this.seen.add(key);
            out.push({ kind: 'substitution', entry });
        }
        if (this.phase !== null && state.phase !== this.phase) {
            out.push({ kind: 'phase', phase: state.phase });
        }
        this.phase = state.phase;
        return out;
    }
}
