/**
 * La page de test.
 *
 * Elle montre l'empilement réel d'OBS et permet de tout piloter sans quitter
 * l'écran — c'est ce qui compte quand on répète seul : on ne peut pas regarder
 * l'antenne sur un écran et chercher un bouton sur l'autre.
 *
 * Elle ne décide de rien : comme la régie, elle envoie des intentions au
 * serveur, qui tranche et rediffuse. Deux pages ouvertes restent donc
 * d'accord.
 */
import { findScene, SCENES } from '@kz/core';
const el = (id) => document.getElementById(id);
const tv = el('tv');
const bar = el('bar');
const scenesBox = el('scenes');
const delai = el('delai');
const boutonInserts = el('inserts');
const boutonPlein = el('plein');
let control = null;
// ── Mise à l'échelle : les iframes font 1920×1080, le cadre fait ce qu'il peut.
function ajuster() {
    const echelle = tv.clientWidth / 1920;
    for (const frame of tv.querySelectorAll('iframe')) {
        frame.style.transform = `scale(${echelle})`;
    }
}
new ResizeObserver(ajuster).observe(tv);
window.addEventListener('resize', ajuster);
ajuster();
// ── Commandes ───────────────────────────────────────────────────────────────
async function commande(chemin) {
    try {
        const reponse = await fetch(`/api/${chemin}`);
        const donnees = (await reponse.json());
        if (donnees.control)
            appliquer(donnees.control);
    }
    catch {
        // Le serveur est tombé : la page reste utilisable, l'état se resynchronise
        // au prochain sondage.
    }
}
for (const scene of SCENES) {
    const bouton = document.createElement('button');
    bouton.textContent = scene.name;
    bouton.dataset.scene = scene.id;
    bouton.addEventListener('click', () => void commande(`scene/${scene.id}`));
    scenesBox.append(bouton);
}
for (const bouton of document.querySelectorAll('[data-nudge]')) {
    bouton.addEventListener('click', () => void commande(`delay/nudge/${bouton.dataset.nudge}`));
}
for (const bouton of document.querySelectorAll('[data-speed]')) {
    bouton.addEventListener('click', () => void commande(`speed/${bouton.dataset.speed}`));
}
boutonInserts.addEventListener('click', () => {
    void commande(`inserts/${control?.insertMode === 'off' ? 'auto' : 'off'}`);
});
// ── Plein écran ─────────────────────────────────────────────────────────────
boutonPlein.addEventListener('click', () => void basculerPlein());
async function basculerPlein() {
    try {
        if (document.fullscreenElement)
            await document.exitFullscreen();
        else
            await document.body.requestFullscreen();
    }
    catch {
        // Certains navigateurs refusent hors geste direct : sans conséquence.
    }
}
document.addEventListener('fullscreenchange', () => {
    boutonPlein.textContent = document.fullscreenElement ? 'Quitter' : 'Plein écran';
    ajuster();
});
/**
 * En plein écran, la barre s'efface au repos.
 *
 * Deux secondes et demie : assez pour ne pas clignoter entre deux gestes,
 * assez court pour que l'écran soit propre quand on regarde vraiment.
 */
let minuterieRepos = 0;
function reveiller() {
    document.body.classList.remove('repos');
    window.clearTimeout(minuterieRepos);
    minuterieRepos = window.setTimeout(() => {
        if (document.fullscreenElement)
            document.body.classList.add('repos');
    }, 2_500);
}
for (const evenement of ['mousemove', 'keydown', 'click']) {
    document.addEventListener(evenement, reveiller);
}
// ── Clavier ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (evenement) => {
    if (evenement.metaKey || evenement.ctrlKey || evenement.altKey)
        return;
    const touche = evenement.key.toLowerCase();
    if (touche === 'f') {
        void basculerPlein();
        evenement.preventDefault();
        return;
    }
    if (touche === 'i') {
        void commande(`inserts/${control?.insertMode === 'off' ? 'auto' : 'off'}`);
        evenement.preventDefault();
        return;
    }
    if (evenement.key >= '1' && evenement.key <= '9') {
        const scene = SCENES[Number(evenement.key) - 1];
        if (scene) {
            void commande(`scene/${scene.id}`);
            evenement.preventDefault();
        }
        return;
    }
    if (evenement.key === 'ArrowLeft' || evenement.key === 'ArrowRight') {
        const pas = evenement.shiftKey ? 1000 : 250;
        void commande(`delay/nudge/${evenement.key === 'ArrowLeft' ? -pas : pas}`);
        evenement.preventDefault();
    }
});
// ── État ────────────────────────────────────────────────────────────────────
function appliquer(prochain) {
    control = prochain;
    delai.textContent = `${(prochain.delayMs / 1000).toFixed(1).replace('.', ',')} s`;
    marquer(scenesBox, 'scene', prochain.sceneId);
    for (const bouton of document.querySelectorAll('[data-speed]')) {
        bouton.dataset.on = Number(bouton.dataset.speed) === prochain.timeScale ? '1' : '0';
    }
    const auto = prochain.insertMode === 'auto';
    boutonInserts.textContent = auto ? 'Automatiques' : 'Coupés';
    boutonInserts.dataset.on = auto ? '1' : '0';
    document.title = `KZ Studio — ${findScene(prochain.sceneId).name}`;
}
function marquer(boite, attribut, valeur) {
    for (const bouton of boite.querySelectorAll(`[data-${attribut}]`)) {
        bouton.dataset.on = bouton.dataset[attribut] === valeur ? '1' : '0';
    }
}
async function sonder() {
    try {
        const reponse = await fetch('/api/status');
        const donnees = (await reponse.json());
        appliquer(donnees.control);
    }
    catch {
        /* le serveur reviendra */
    }
}
void sonder();
// Une seconde suffit : cette page suit l'état, elle ne le pilote pas seule.
window.setInterval(() => void sonder(), 1_000);
