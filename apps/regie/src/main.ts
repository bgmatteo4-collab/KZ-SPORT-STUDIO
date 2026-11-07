/**
 * La régie.
 *
 * Elle n'affiche pas l'habillage : elle le pilote. Règle n°1 du projet — elle
 * envoie des INTENTIONS, le serveur décide, borne les valeurs et rediffuse à
 * tout le monde. Deux régies ouvertes restent donc toujours d'accord, et
 * l'overlay ne peut pas se désynchroniser d'elles.
 *
 * Trois partis pris qui en font un outil de direct plutôt qu'un formulaire :
 *
 *   • TOUT TIENT SUR UN ÉCRAN. Rien ne défile.
 *   • ON VOIT CE QUI EST À L'ANTENNE. Le moniteur est le vrai overlay, pas une
 *     description de l'overlay.
 *   • LE CLAVIER D'ABORD. 1 à 9 pour les scènes, flèches pour le décalage.
 *     En plein match, on ne vise pas un bouton à la souris.
 */

import {
  clockLabel,
  findScene,
  insertActif,
  nomWidget,
  INSERTS,
  PHASE_LABEL,
  SCENE_MODES,
  SCENES,
  StateCursor,
  THEMES,
  ClockSync,
  DEFAULT_CONTROL,
  detailDuFait,
  LIBELLE,
  VALEUR_FIL,
  type ClientMessage,
  type Command,
  type ControlState,
  type MatchState,
  type ProviderStatus,
  type ServerMessage,
} from '@kz/core';
import { monterSelecteur } from './picker.js';
import { anime, MOUVEMENTS } from './ressort.js';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const lampLink = el('lamp-link');
const lampSource = el('lamp-source');
const lampLive = el('lamp-live');
const nowHome = el('now-home');
const nowAway = el('now-away');
const nowScore = el('now-score');
const nowClock = el('now-clock');
const nowPhase = el('now-phase');
const sceneName = el('scene-name');
const statutSource = el('statut-source');
const statutLacunes = el('statut-lacunes');
const statutLatence = el('statut-latence');
const statutTimeline = el('statut-timeline');
const inspScene = el('insp-scene');
const inspCam = el('insp-cam');
const inspTransition = el('insp-transition');
const inspCouches = el('insp-couches');
const scenesBox = el('scenes');
const modesBox = el('modes');
const pickButton = el('pick-match');
const pickNow = el('pick-now');
const themesMenu = el<HTMLSelectElement>('themes');
const camBox = el('cam-mode');
const speedMenu = el<HTMLSelectElement>('speed');
const speedField = el('field-speed');
const insertSwitch = el<HTMLButtonElement>('insert-switch');
const insertsBox = el('inserts');
const feedBox = el('feed');
const delayInput = el<HTMLInputElement>('delay');
const delayValue = el<HTMLOutputElement>('delay-value');
const toast = el('toast');

const cursor = new StateCursor();
const sync = new ClockSync();
let control: ControlState = { ...DEFAULT_CONTROL };
let provider: ProviderStatus = { name: '…', connected: false, lastEventAt: null };
let socket: WebSocket | null = null;
let connected = false;
/** Le curseur est-il saisi ? Si oui, on ne l'écrase pas sous les doigts. */
let draggingDelay = false;

// ──────────────────────────── L'inspecteur ───────────────────────────────────
//
// Trois onglets, parce qu'une colonne qui empile le décalage, les habillages,
// les inserts, la caméra, les adresses OBS et un diagnostic de source n'a pas
// de sujet : on y cherche. Un inspecteur a toujours un sujet.
//
//   Scène   — ce que contient ce qu'on envoie, et la régie automatique
//   Antenne — ce qui part en direct : décalage, habillage, emblème
//   Studio  — la machine : caméra, OBS, raccourcis
//
// Le curseur glisse d'un onglet à l'autre sur un RESSORT, pas sur une courbe :
// cliquer vite sur trois onglets ne doit pas produire trois départs à zéro.

const onglets = el('onglets');
const curseurOnglet = el('onglets-curseur');
const volets = [...document.querySelectorAll<HTMLElement>('[data-volet]')];
const boutonsOnglet = [...onglets.querySelectorAll<HTMLButtonElement>('[data-onglet]')];

const glisserCurseur = anime(0, MOUVEMENTS.vif, (x) => {
  curseurOnglet.style.transform = `translateX(${x}px)`;
});

function placerCurseur(bouton: HTMLButtonElement, anime_ = true): void {
  const largeur = bouton.offsetWidth;
  curseurOnglet.style.width = `${largeur}px`;
  if (anime_) glisserCurseur(bouton.offsetLeft);
  else curseurOnglet.style.transform = `translateX(${bouton.offsetLeft}px)`;
}

function montrerOnglet(nom: string): void {
  for (const b of boutonsOnglet) {
    const actif = b.dataset.onglet === nom;
    b.setAttribute('aria-selected', actif ? 'true' : 'false');
    if (actif) placerCurseur(b);
  }
  for (const v of volets) v.hidden = v.dataset.volet !== nom;
}

for (const bouton of boutonsOnglet) {
  bouton.addEventListener('click', () => montrerOnglet(bouton.dataset.onglet ?? 'scene'));
}
// La largeur d'un onglet dépend de la police : on attend qu'elle soit là.
void document.fonts?.ready.then(() => {
  const actif = boutonsOnglet.find((b) => b.getAttribute('aria-selected') === 'true');
  if (actif) placerCurseur(actif, false);
});
new ResizeObserver(() => {
  const actif = boutonsOnglet.find((b) => b.getAttribute('aria-selected') === 'true');
  if (actif) placerCurseur(actif, false);
}).observe(onglets);

// ───────────────────────────── Pupitre de scènes ──────────────────────────────

SCENES.forEach((scene, index) => {
  const button = document.createElement('button');
  button.className = 'scene';
  button.dataset.scene = scene.id;
  const key = index < 9 ? String(index + 1) : index === 9 ? '0' : '';
  button.append(
    Object.assign(document.createElement('span'), {
      className: 'scene__key',
      textContent: key || '—',
    }),
    Object.assign(document.createElement('span'), { textContent: scene.name }),
  );
  button.addEventListener('click', () => send({ name: 'set-scene', sceneId: scene.id }));
  scenesBox.append(button);
});

// ───────────────────────────── Le moment d'émission ───────────────────────────
//
// Quatre boutons, pas quatre scènes : le décor ne bouge pas, seul le propos
// change. C'est ce qui permet de passer de l'avant-match au coup d'envoi sans
// que le spectateur voie un changement de plateau.

for (const mode of SCENE_MODES) {
  const button = document.createElement('button');
  button.className = 'scene scene--mode';
  button.dataset.mode = mode.id;
  button.textContent = mode.nom;
  button.addEventListener('click', () => send({ name: 'set-scene-mode', mode: mode.id }));
  modesBox.append(button);
}

// ───────────────────────────── Les menus ─────────────────────────────────────
//
// Dix habillages en dix boutons occupaient trois rangées pour un réglage qu'on
// touche une fois par soirée. Un menu dit sa valeur courante en une ligne.

for (const theme of THEMES) {
  const option = document.createElement('option');
  option.value = theme.id;
  option.textContent = theme.name;
  themesMenu.append(option);
}
themesMenu.addEventListener('change', () =>
  send({ name: 'set-theme', themeId: themesMenu.value }),
);

for (const vitesse of [1, 2, 4, 10, 20]) {
  const option = document.createElement('option');
  option.value = String(vitesse);
  option.textContent = vitesse === 1 ? 'Temps réel' : `×${vitesse}`;
  speedMenu.append(option);
}
speedMenu.addEventListener('change', () =>
  send({ name: 'replay-speed', speed: Number(speedMenu.value) }),
);

// ──────────────────────── La régie automatique ───────────────────────────────
//
// Plus de boutons pour imposer un panneau. Les inserts sont MOTIVÉS — après un
// but, dans un temps mort — et les imposer à la main revenait à défaire la
// seule chose qui les rend crédibles. L'interrupteur les coupe, et la liste
// dit en permanence ce qui est à l'antenne et pourquoi.

insertSwitch.addEventListener('click', () =>
  send({
    name: 'set-insert-mode',
    insertMode: control.insertMode === 'auto' ? 'off' : 'auto',
  }),
);

// Le bouton de l'interrupteur glisse sur un RESSORT, pas sur une transition.
// Un interrupteur qu'on bascule deux fois de suite doit repartir de là où il
// en est, pas sauter à son point de départ pour recommencer.
const bouton = insertSwitch.querySelector<HTMLElement>('i');
const glisserBouton = anime(0, MOUVEMENTS.vif, (x) => {
  if (bouton) bouton.style.transform = `translateX(${x}px)`;
});

const lignesInsert = INSERTS.map((spec) => {
  const nom = document.createElement('span');
  nom.className = 'insert__nom';
  nom.textContent = spec.nom;
  const etat = document.createElement('span');
  etat.className = 'insert__etat';
  etat.textContent = 'en attente';
  const li = document.createElement('li');
  li.className = 'insert';
  li.dataset.on = '0';
  li.append(nom, etat);
  insertsBox.append(li);
  return { spec, etat, li };
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-nudge]')) {
  button.addEventListener('click', () =>
    send({ name: 'nudge-delay', deltaMs: Number(button.dataset.nudge) }),
  );
}

for (const button of camBox.querySelectorAll<HTMLButtonElement>('[data-cam]')) {
  button.addEventListener('click', () =>
    send({ name: 'set-cam-mode', camMode: button.dataset.cam as 'obs' | 'browser' }),
  );
}

delayInput.addEventListener('pointerdown', () => { draggingDelay = true; });
delayInput.addEventListener('pointerup', () => { draggingDelay = false; });
delayInput.addEventListener('input', () => {
  const ms = Number(delayInput.value);
  delayValue.textContent = formatDelay(ms);
  send({ name: 'set-delay', delayMs: ms });
});

// ──────────────────────────── Sources OBS ────────────────────────────────────

const urls = {
  fg: `${location.origin}/overlay/?layer=fg`,
  bg: `${location.origin}/overlay/?layer=bg`,
};
el('url-fg').textContent = urls.fg;
el('url-bg').textContent = urls.bg;

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
    const which = button.dataset.copy as 'fg' | 'bg';
    try {
      await navigator.clipboard.writeText(urls[which]);
      flash('Adresse copiée');
    } catch {
      // Presse-papiers refusé (page non sécurisée) : on sélectionne pour que
      // l'utilisateur puisse copier à la main plutôt que de rester sans rien.
      const code = button.querySelector('code');
      if (code) {
        const range = document.createRange();
        range.selectNodeContents(code);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
      }
      flash('Sélectionné — Ctrl+C');
    }
  });
}

// ───────────────────── L'emblème de la compétition ──────────────────────────
//
// ESPN sert les emblèmes de compétition, mais il les date de mai 2019 et ne
// les a jamais remis à jour : son logo de Ligue 1 est encore celui d'avant
// 2020, en gris. Le dossier qui permet d'imposer le bon existait déjà, avec
// son mode d'emploi — mais rien ne le disait à l'écran, et « la Ligue 1 n'est
// toujours pas bonne » est donc resté vrai pendant une semaine. La régie
// annonce maintenant d'où vient l'emblème, et le nom de fichier exact.

const emblemeBouton = el<HTMLButtonElement>('embleme');
const emblemeEtat = el('embleme-etat');
const emblemeFichier = el('embleme-fichier');

/** Les codes pour lesquels un fichier a été déposé. `null` tant qu'on ignore. */
let emblemesLocaux: Set<string> | null = null;
let competitionVue: string | null = null;

async function relireEmblemes(): Promise<void> {
  try {
    const r = await fetch('/api/emblemes');
    const d = (await r.json()) as { presents?: string[] };
    emblemesLocaux = new Set(d.presents ?? []);
  } catch {
    // Le serveur ne répond pas : on ne prétend pas savoir. Mieux vaut ne rien
    // afficher qu'affirmer à tort qu'un fichier manque.
    emblemesLocaux = null;
  }
}
void relireEmblemes();
// Un fichier déposé en pleine émission doit se voir sans redémarrer.
window.setInterval(() => void relireEmblemes(), 30_000);

function majEmbleme(competitionId: string | undefined): void {
  const id = competitionId ?? '';
  if (id === competitionVue && emblemesLocaux !== null) return;
  competitionVue = id;

  if (!id) {
    setTexte(emblemeEtat, 'compétition inconnue');
    setTexte(emblemeFichier, '');
    emblemeBouton.dataset.local = '1';
    emblemeEtat.dataset.local = '1';
    return;
  }
  const local = emblemesLocaux?.has(id) ?? false;
  // `data-local` masque le chemin quand il n'y a plus rien à faire : on ne
  // propose pas une action déjà accomplie.
  emblemeBouton.dataset.local = local ? '1' : '0';
  emblemeEtat.dataset.local = local ? '1' : '0';
  setTexte(emblemeEtat, local ? 'fichier local' : 'fourni par ESPN (2019)');
  setTexte(emblemeFichier, `assets/competitions/${id}.png`);
}

emblemeBouton.addEventListener('click', async () => {
  const chemin = emblemeFichier.textContent ?? '';
  if (!chemin) return;
  try {
    await navigator.clipboard.writeText(chemin);
    flash('Chemin copié');
  } catch {
    flash(chemin);
  }
});

let toastTimer = 0;
function flash(message: string): void {
  toast.textContent = message;
  toast.dataset.on = '1';
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.dataset.on = '0'; }, 1600);
}

// ──────────────────────────── Le choix du match ──────────────────────────────

const selecteur = monterSelecteur(flash);
// Deux chemins vers le même menu : le bouton dédié de la colonne Antenne, et
// le bandeau du haut — on clique sur le match qu'on veut remplacer.
pickButton.addEventListener('click', () => selecteur.ouvrir());
el('now').addEventListener('click', () => selecteur.ouvrir());

// ─────────────────────────────── Le clavier ──────────────────────────────────
// En plein match, on ne vise pas un bouton à la souris.

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  // Tant que le sélecteur est ouvert, il a le clavier pour lui : les chiffres
  // y servent à filtrer, pas à changer de scène à l'antenne par mégarde.
  if (selecteur.ouvert) return;

  if (event.key >= '1' && event.key <= '9') {
    const scene = SCENES[Number(event.key) - 1];
    if (scene) {
      send({ name: 'set-scene', sceneId: scene.id });
      event.preventDefault();
    }
    return;
  }
  if (event.key === '0' && SCENES[9]) {
    send({ name: 'set-scene', sceneId: SCENES[9].id });
    event.preventDefault();
    return;
  }

  // Flèches : le décalage, finement. Avec Maj, par seconde entière.
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const step = event.shiftKey ? 1000 : 250;
    send({ name: 'nudge-delay', deltaMs: event.key === 'ArrowLeft' ? -step : step });
    event.preventDefault();
  }
});

// ─────────────────────── Le moniteur : le vrai overlay ───────────────────────
// Pas une description de ce qui est à l'antenne : ce qui est à l'antenne.

const monitor = el('monitor');
function fitMonitor(): void {
  const scale = monitor.clientWidth / 1920;
  for (const frame of monitor.querySelectorAll('iframe')) {
    frame.style.transform = `scale(${scale})`;
  }
}
new ResizeObserver(fitMonitor).observe(monitor);
fitMonitor();

// ─────────────────────────────── Connexion ───────────────────────────────────

function connect(): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = ws;

  ws.addEventListener('open', () => {
    connected = true;
    ping();
  });

  ws.addEventListener('message', (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'hello':
        cursor.replace(message.events);
        applyControl(message.control);
        provider = message.provider;
        break;
      case 'events':
        cursor.ingest(message.events);
        break;
      case 'control':
        applyControl(message.control);
        break;
      case 'provider':
        provider = message.provider;
        break;
      case 'pong':
        sync.sample(message.clientSent, message.serverTime, Date.now());
        break;
    }
  });

  ws.addEventListener('close', () => {
    connected = false;
    window.setTimeout(connect, 1_000);
  });
}

window.setInterval(ping, 5_000);

function ping(): void {
  sendRaw({ type: 'ping', sent: Date.now() });
}

function sendRaw(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function send(command: Command): void {
  sendRaw({ type: 'command', command });
}

function applyControl(next: ControlState): void {
  control = next;
  sync.setScale(next.timeScale);

  if (!draggingDelay) {
    delayInput.value = String(next.delayMs);
    delayValue.textContent = formatDelay(next.delayMs);
  }

  mark(scenesBox, 'scene', next.sceneId);
  mark(camBox, 'cam', next.camMode);
  mark(modesBox, 'mode', next.sceneMode);
  themesMenu.value = next.themeId;
  speedMenu.value = String(next.timeScale);

  // La vitesse ne concerne qu'un rejeu. En direct, le réglage n'a aucun effet
  // et sa seule présence laisse croire qu'il en a un.
  speedField.hidden = next.source.provider !== 'simulator';

  const auto = next.insertMode === 'auto';
  insertSwitch.setAttribute('aria-checked', auto ? 'true' : 'false');
  insertSwitch.dataset.on = auto ? '1' : '0';
  insertsBox.dataset.coupes = auto ? '0' : '1';
  glisserBouton(auto ? 20 : 0);
  // Une scène sans variantes de mode ignore les quatre boutons : autant le
  // dire, plutôt que de laisser cliquer sur des boutons sans effet.
  modesBox.dataset.actif = findScene(next.sceneId).modes ? '1' : '0';
  sceneName.textContent = findScene(next.sceneId).name;
  pickNow.textContent = next.source.label ?? describeSource(next.source);
  selecteur.setSource(next.source);
}

/** De quoi nommer la source quand aucun libellé n'a été retenu. */
function describeSource(source: ControlState['source']): string {
  if (source.provider === 'simulator') return 'Rejeu — match enregistré';
  if (!source.eventId) return 'Premier match en cours';
  return `Match ${source.eventId}`;
}

function mark(box: HTMLElement, attribute: string, value: string): void {
  for (const button of box.querySelectorAll<HTMLButtonElement>(`[data-${attribute}]`)) {
    button.dataset.on = button.dataset[attribute] === value ? '1' : '0';
  }
}

function formatDelay(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

// ────────────────────────────── Rafraîchissement ─────────────────────────────

let feedSignature = '';

function refresh(): void {
  const state = cursor.at(sync.now() - control.delayMs);

  lampLink.dataset.on = connected ? '1' : '0';
  lampSource.dataset.on = provider.connected ? '1' : '0';
  const onAir = state.phase !== 'pre' && state.phase !== 'full_time';
  lampLive.dataset.on = onAir ? '1' : '0';

  // Un match lancé par variable d'environnement n'a pas de libellé retenu :
  // plutôt qu'un identifiant brut, on nomme les équipes dès qu'on les connaît.
  if (!control.source.label && state.meta) {
    pickNow.textContent = `${state.meta.home.short} – ${state.meta.away.short}`;
  }

  nowHome.textContent = state.meta?.home.abbr ?? '—';
  nowAway.textContent = state.meta?.away.abbr ?? '—';
  nowScore.textContent = `${state.score[0]}–${state.score[1]}`;

  const label = clockLabel(state.clockMs, state.phase, state.clock.addedMinutes);
  nowClock.textContent = onAir ? `${label.main}${label.added ?? ''}` : '—';
  nowPhase.textContent = PHASE_LABEL[state.phase];

  majStatut();

  majInserts(state);
  majInspecteur();
  majEmbleme(state.meta?.competitionId);

  renderFeed(state);
  requestAnimationFrame(refresh);
}

/**
 * La barre d'état : ce qu'on surveille du coin de l'œil.
 *
 * Le diagnostic de source occupait un bloc dans la colonne de réglages, où
 * il n'avait rien à faire : ce n'est pas quelque chose qu'on règle. Un
 * logiciel met ça en bas, sur une ligne, et c'est exactement la bonne place —
 * toujours visible, jamais dans le chemin.
 *
 * Les lacunes sont séparées du reste et marquées : « xG absent » n'est pas du
 * même ordre que « 82 appels ». L'une est une panne possible, l'autre un
 * compteur.
 */
function majStatut(): void {
  const brut = provider.detail ?? provider.name;
  const coupe = brut.indexOf('lacunes :');
  setTexte(statutSource, coupe < 0 ? brut : brut.slice(0, coupe).replace(/[—\-\s]+$/, ''));
  const lacunes = coupe < 0 ? '' : brut.slice(coupe + 'lacunes :'.length).trim();
  statutLacunes.hidden = lacunes === '';
  setTexte(statutLacunes, lacunes);
  statutLacunes.title = lacunes;

  // L'écart entre l'horloge du navigateur et celle du serveur. Un poste mal
  // réglé affiche le match décalé de plusieurs secondes, et personne ne
  // comprend pourquoi tant que ce chiffre n'est pas sous les yeux.
  const ecart = sync.currentOffset;
  setTexte(statutLatence, `horloge ${ecart >= 0 ? '+' : ''}${Math.round(ecart)} ms`);
  setTexte(statutTimeline, `${cursor.size} événements`);
}

/**
 * Ce que la scène sélectionnée CONTIENT.
 *
 * C'est le propre d'un inspecteur : décrire l'objet choisi. L'opérateur
 * voyait jusqu'ici le nom d'une scène et devait se rappeler ce qu'il y avait
 * dedans — ou l'envoyer pour le découvrir. Les couches sont listées par leur
 * nom d'antenne, pas par leur clé de registre.
 */
let coucheSignature = '';

function majInspecteur(): void {
  const scene = findScene(control.sceneId);
  const couches = (scene.modes?.[control.sceneMode] ?? scene.layers)
    .filter((l) => l.widget !== 'backdrop' && l.widget !== 'cam-frame')
    .sort((a, b) => a.z - b.z);

  setTexte(inspScene, scene.name);
  setTexte(
    inspCam,
    scene.cam === null
      ? 'masquée'
      : `${Math.round(scene.cam.w * 100)} % de large · ${scene.camStyle}`,
  );
  setTexte(inspTransition, `${scene.transition.kind} · ${scene.transition.ms} ms`);

  const signature = `${scene.id}|${control.sceneMode}|${couches.map((l) => l.widget).join(',')}`;
  if (signature === coucheSignature) return;
  coucheSignature = signature;

  inspCouches.replaceChildren();
  for (const couche of couches) {
    const li = document.createElement('li');
    li.className = 'couche';
    const nom = document.createElement('span');
    nom.className = 'couche__nom';
    nom.textContent = nomWidget(couche.widget);
    const place = document.createElement('span');
    place.className = 'couche__place';
    // Où, en clair. « x 0.746 w 0.246 » ne dit rien à personne ; « droite,
    // haut » se lit sans traduire.
    place.textContent = situer(couche.slot);
    li.append(nom, place);
    inspCouches.append(li);
  }
  if (couches.length === 0) {
    const li = document.createElement('li');
    li.className = 'couche couche--vide';
    li.textContent = 'Aucun panneau sur cette scène.';
    inspCouches.append(li);
  }
}

/** Un rectangle normalisé, dit en français. */
function situer(slot: { x: number; y: number; w: number; h: number }): string {
  if (slot.w > 0.9 && slot.h > 0.9) return 'plein cadre';
  const cx = slot.x + slot.w / 2;
  const cy = slot.y + slot.h / 2;
  const colonne = cx < 0.34 ? 'gauche' : cx > 0.66 ? 'droite' : 'centre';
  if (slot.h < 0.2 && slot.w > 0.8) return cy < 0.5 ? 'bandeau haut' : 'bandeau bas';
  const rangee = cy < 0.4 ? 'haut' : cy > 0.72 ? 'bas' : 'milieu';
  return `${colonne}, ${rangee}`;
}

/**
 * Ce que la régie automatique fait, en permanence, et pourquoi.
 *
 * C'est la contrepartie d'avoir retiré les boutons : un automatisme qu'on ne
 * peut pas forcer doit au minimum être LISIBLE. Sans son motif, un panneau
 * qui surgit à l'antenne ressemble à un défaut — y compris pour celui qui
 * l'a programmé.
 */
function majInserts(state: MatchState): void {
  const scene = findScene(control.sceneId);
  const actif =
    control.insertMode === 'auto' && scene.insertSlot
      ? insertActif(state, sync.now() - control.delayMs)
      : null;

  for (const { spec, etat, li } of lignesInsert) {
    const surLui = actif?.spec.id === spec.id;
    li.dataset.on = surLui ? '1' : '0';
    if (surLui && actif) {
      // Le temps qu'il reste : un opérateur qui voit « 6 s » sait qu'il peut
      // attendre avant de changer de scène.
      const reste = Math.max(0, Math.round((actif.to - (sync.now() - control.delayMs)) / 1000));
      setTexte(etat, `${actif.motif} · ${reste} s`);
    } else {
      // Court, parce que la colonne est étroite : une phrase complète s'y
      // terminerait par « … », ce qui revient à ne rien dire.
      setTexte(
        etat,
        control.insertMode === 'off' ? 'coupé' : scene.insertSlot ? 'en attente' : 'hors scène',
      );
    }
  }
}

/** N'écrit dans le DOM que si la valeur a changé : appelé à chaque image. */
function setTexte(node: HTMLElement, valeur: string): void {
  if (node.textContent !== valeur) node.textContent = valeur;
}

/**
 * Les faits de jeu, du plus récent au plus ancien.
 *
 * Lit `state.feed`, comme le fil du match à l'antenne. La régie fabriquait
 * auparavant ses propres libellés — « Carton », « But », les flèches d'un
 * remplacement — ce qui faisait un quatrième vocabulaire après ceux de la
 * feuille de match et de la carte des tirs. L'opérateur lit maintenant
 * exactement les mots qui partent à l'antenne, ce qui est la moindre des
 * choses pour un moniteur de contrôle. Et il y gagne les frappes, qui
 * n'apparaissaient nulle part de son côté.
 */
function renderFeed(state: MatchState): void {
  const faits = [...state.feed].reverse();

  const signature = faits.map((f) => `${f.kind}${f.seq}`).join(',');
  if (signature === feedSignature) return;
  feedSignature = signature;

  feedBox.replaceChildren();
  if (faits.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'feed__empty';
    empty.textContent = 'Rien encore.';
    feedBox.append(empty);
    return;
  }

  for (const fait of faits) {
    const side = fait.side === 'home' ? state.meta?.home.abbr : state.meta?.away.abbr;
    const row = document.createElement('li');
    row.className = 'ev';
    row.dataset.valeur = String(VALEUR_FIL[fait.kind]);

    const minute = document.createElement('span');
    minute.className = 'ev__minute';
    minute.textContent = `${fait.minute}'`;

    const mark = document.createElement('i');
    mark.className = 'ev__mark';
    mark.dataset.kind = fait.kind;

    const name = document.createElement('span');
    name.className = 'ev__name';
    const detail = detailDuFait(fait, true);
    name.textContent = detail ? `${LIBELLE[fait.kind]} · ${detail}` : LIBELLE[fait.kind];

    const team = document.createElement('span');
    team.className = 'ev__side';
    team.textContent = side ?? '';

    row.append(minute, mark, name, team);
    feedBox.append(row);
  }
}

connect();
requestAnimationFrame(refresh);
