/**
 * Le sélecteur de match.
 *
 * ── Ce qu'il doit être ──────────────────────────────────────────────────────
 *
 * Choisir un match, c'est un geste qu'on fait UNE fois par émission, souvent
 * dans les minutes qui précèdent l'antenne, parfois dans l'urgence quand le
 * match prévu est reporté. Il doit donc être :
 *
 *   • exhaustif sans être long — tous les championnats suivis, mais les
 *     matchs EN COURS d'abord, parce que c'est ce qu'on cherche neuf fois sur
 *     dix en ouvrant ce menu ;
 *   • filtrable au clavier — on tape « tou » et Toulouse apparaît ;
 *   • honnête sur ce qu'il fait — changer de match n'est pas anodin : ça vide
 *     la timeline et recharge l'overlay. C'est écrit en bas, pas caché.
 *
 * ── Pourquoi il ne ferme pas tout seul après un clic ────────────────────────
 *
 * Il recharge la page. La bascule est une rupture : plutôt que de prétendre
 * recoller les morceaux côté client, on repart proprement du `hello` du
 * serveur, qui porte la nouvelle timeline.
 */

import { ecuLocal, type MatchSource } from '@kz/core';

interface EquipeListe {
  nom: string;
  abbr: string;
  score: number | null;
  logo: string | null;
  couleur: string | null;
}

interface MatchListe {
  id: string;
  ligue: string;
  ligueNom: string;
  ligueLogo: string | null;
  date: string | null;
  etat: 'pre' | 'in' | 'post';
  detail: string;
  minute: string;
  domicile: EquipeListe;
  exterieur: EquipeListe;
}

interface Reponse {
  ligues: { id: string; nom: string }[];
  matchs: MatchListe[];
  source: MatchSource;
}

const RAFRAICHIR_MS = 20_000;

export interface Selecteur {
  ouvrir(): void;
  fermer(): void;
  readonly ouvert: boolean;
  /** La source à l'antenne, pour marquer la ligne correspondante. */
  setSource(source: MatchSource): void;
}

export function monterSelecteur(flash: (message: string) => void): Selecteur {
  /** Un élément indispensable. Absent, c'est un bug de gabarit, pas un cas. */
  const requis = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`sélecteur de match : #${id} manque dans le HTML`);
    return el;
  };

  const racine = requis('picker');
  const liste = requis('picker-list');
  const ligues = requis('picker-leagues');
  const recherche = requis('picker-search') as HTMLInputElement;
  const compte = requis('picker-count');

  let tout: MatchListe[] = [];
  let ligueActive = '*';
  let filtre = '';
  let curseur = 0;
  let source: MatchSource | null = null;
  let ouvert = false;
  let minuterie = 0;
  let bascule = false;

  // ── Les données ──────────────────────────────────────────────────────────

  async function charger(): Promise<void> {
    try {
      const r = await fetch('/api/matchs');
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as Reponse;
      tout = d.matchs ?? [];
      source = d.source ?? source;
      dessinerLigues(d.ligues ?? []);
      dessiner();
    } catch {
      // On garde la liste précédente : un hoquet d'ESPN ne doit pas vider le
      // menu sous les doigts de l'opérateur.
      compte.textContent = 'liste indisponible — dernier état conservé';
    }
  }

  // ── Le rendu ─────────────────────────────────────────────────────────────

  function dessinerLigues(dispo: { id: string; nom: string }[]): void {
    const comptes = new Map<string, number>();
    for (const m of tout) comptes.set(m.ligue, (comptes.get(m.ligue) ?? 0) + 1);

    const chips: { id: string; nom: string; n: number }[] = [
      { id: '*', nom: 'Tous', n: tout.length },
      ...dispo
        .map((l) => ({ id: l.id, nom: l.nom, n: comptes.get(l.id) ?? 0 }))
        // Un championnat sans match aujourd'hui n'a rien à faire dans la barre.
        .filter((l) => l.n > 0),
    ];

    ligues.textContent = '';
    for (const c of chips) {
      const b = document.createElement('button');
      b.className = 'picker__league';
      b.dataset.on = c.id === ligueActive ? '1' : '0';
      b.innerHTML = `${echapper(c.nom)} <i>${c.n}</i>`;
      b.addEventListener('click', () => {
        ligueActive = c.id;
        curseur = 0;
        dessinerLigues(dispo);
        dessiner();
      });
      ligues.append(b);
    }
  }

  function visibles(): MatchListe[] {
    const q = filtre.trim().toLowerCase();
    return tout.filter((m) => {
      if (ligueActive !== '*' && m.ligue !== ligueActive) return false;
      if (!q) return true;
      return (
        m.domicile.nom.toLowerCase().includes(q) ||
        m.exterieur.nom.toLowerCase().includes(q) ||
        m.ligueNom.toLowerCase().includes(q)
      );
    });
  }

  function dessiner(): void {
    const items = visibles();
    if (curseur >= items.length) curseur = Math.max(0, items.length - 1);

    liste.textContent = '';
    for (const [i, m] of items.entries()) {
      liste.append(ligne(m, i === curseur));
    }
    if (items.length === 0) {
      const vide = document.createElement('li');
      vide.className = 'picker__vide';
      vide.textContent = 'Aucun match ne correspond.';
      liste.append(vide);
    }

    const enCours = items.filter((m) => m.etat === 'in').length;
    compte.textContent =
      `${items.length} match${items.length > 1 ? 's' : ''}` +
      (enCours > 0 ? ` · ${enCours} en cours` : '');

    liste.querySelector<HTMLElement>('[data-curseur="1"]')?.scrollIntoView({ block: 'nearest' });
  }

  function ligne(m: MatchListe, actif: boolean): HTMLElement {
    const li = document.createElement('li');
    li.className = 'picker__row';
    li.dataset.curseur = actif ? '1' : '0';
    li.dataset.etat = m.etat;
    if (source && source.eventId === m.id) li.dataset.antenne = '1';

    li.innerHTML = `
      <span class="picker__comp">${img(m.ligueLogo, 'picker__complogo')}<em>${echapper(court(m.ligueNom))}</em></span>
      <span class="picker__etat">${etatTexte(m)}</span>
      <span class="picker__equipe picker__equipe--dom">
        <b>${echapper(m.domicile.nom)}</b>${img(m.domicile.logo, 'picker__ecu')}
      </span>
      <span class="picker__score">${score(m)}</span>
      <span class="picker__equipe picker__equipe--ext">
        ${img(m.exterieur.logo, 'picker__ecu')}<b>${echapper(m.exterieur.nom)}</b>
      </span>
      <span class="picker__marque">${source && source.eventId === m.id ? 'À l’antenne' : ''}</span>
    `;

    li.addEventListener('click', () => void choisir(m));
    li.addEventListener('mouseenter', () => {
      const items = visibles();
      const i = items.findIndex((x) => x.id === m.id);
      if (i >= 0 && i !== curseur) {
        curseur = i;
        dessiner();
      }
    });
    return li;
  }

  /** Les noms d'ESPN sont longs ; la barre de championnats, étroite. */
  function court(nom: string): string {
    return nom
      .replace('Ligue des Champions', 'Champions')
      .replace('Ligue Conférence', 'Conférence')
      .replace('Premier League', 'Premier');
  }

  function etatTexte(m: MatchListe): string {
    if (m.etat === 'in') return `<i class="picker__live"></i>${echapper(m.minute)}'`;
    if (m.etat === 'post') return 'Terminé';
    // ESPN rend l'heure en anglais et dans SON fuseau. On reformate depuis la
    // date ISO, dans le fuseau de l'opérateur — c'est la seule qui l'intéresse.
    if (!m.date) return '—';
    const d = new Date(m.date);
    return Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function score(m: MatchListe): string {
    if (m.etat === 'pre' || m.domicile.score === null || m.exterieur.score === null) return 'vs';
    return `${m.domicile.score}<i>–</i>${m.exterieur.score}`;
  }

  // ── La bascule ───────────────────────────────────────────────────────────

  async function choisir(m: MatchListe): Promise<void> {
    if (bascule) return;
    bascule = true;
    racine.dataset.busy = '1';
    const nom = `${m.domicile.nom} – ${m.exterieur.nom}`;
    try {
      const r = await fetch(
        `/api/match/${encodeURIComponent(m.ligue)}/${encodeURIComponent(m.id)}` +
          `?label=${encodeURIComponent(nom)}`,
        { method: 'POST' },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? String(r.status));
      flash(`Bascule sur ${nom}`);
      // On repart du `hello` du serveur plutôt que de recoller les morceaux.
      window.setTimeout(() => window.location.reload(), 700);
    } catch (erreur) {
      flash(`Bascule impossible : ${erreur instanceof Error ? erreur.message : erreur}`);
      racine.dataset.busy = '0';
      bascule = false;
    }
  }

  // ── Ouverture, fermeture, clavier ────────────────────────────────────────

  function ouvrir(): void {
    if (ouvert) return;
    ouvert = true;
    racine.dataset.on = '1';
    filtre = '';
    recherche.value = '';
    curseur = 0;
    void charger();
    minuterie = window.setInterval(() => void charger(), RAFRAICHIR_MS);
    window.setTimeout(() => recherche.focus(), 40);
  }

  function fermer(): void {
    if (!ouvert) return;
    ouvert = false;
    racine.dataset.on = '0';
    window.clearInterval(minuterie);
    // Rendre le clavier à la régie. Sans ce `blur`, le champ de recherche
    // garde le focus une fois le menu fermé — et la régie, qui ignore les
    // touches tapées dans un champ, devient sourde : plus de scènes au
    // clavier, et « M » ne rouvre même plus ce menu.
    recherche.blur();
    document.getElementById('now')?.focus();
  }

  racine.addEventListener('click', (e) => {
    // Cliquer le voile ferme ; cliquer la carte, non.
    if (e.target === racine) fermer();
  });
  document.getElementById('picker-close')?.addEventListener('click', fermer);

  recherche.addEventListener('input', () => {
    filtre = recherche.value;
    curseur = 0;
    dessiner();
  });

  // Le clavier du sélecteur est capté ICI, pas dans la régie : tant qu'il est
  // ouvert, les chiffres servent à filtrer, pas à changer de scène.
  racine.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      fermer();
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = visibles();
      if (items.length === 0) return;
      curseur = (curseur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      dessiner();
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      const m = visibles()[curseur];
      if (m) void choisir(m);
      e.preventDefault();
    }
  });

  return {
    ouvrir,
    fermer,
    get ouvert() {
      return ouvert;
    },
    setSource(s: MatchSource) {
      source = s;
      if (ouvert) dessiner();
    },
  };
}

// ────────────────────────────────── Outils ───────────────────────────────────

function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

/**
 * Une image qui s'efface si elle ne charge pas.
 *
 * Même discipline qu'à l'antenne : rien n'est rangé dans le dépôt, l'adresse
 * vient de la donnée, et un logo absent laisse le nom tranquille plutôt qu'un
 * rectangle cassé.
 */
function img(url: string | null, classe: string): string {
  const local = ecuLocal(url);
  if (!local) return '';
  return `<img class="${classe}" src="${echapper(local)}" alt="" loading="lazy" onerror="this.remove()">`;
}
