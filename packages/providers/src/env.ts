/**
 * Charger un fichier `.env`.
 *
 * ── Pourquoi ces quinze lignes plutôt qu'une dépendance ─────────────────────
 *
 * Parce que c'est tout ce dont on a besoin, et qu'une dépendance de plus dans
 * un outil de direct est une chose de plus qui peut casser un soir de match.
 *
 * ── Pourquoi elles existent ─────────────────────────────────────────────────
 *
 * Node ne lit PAS `.env` tout seul. Le lanceur écrivait consciencieusement
 * `KZ_PROVIDER=espn` dans un fichier que personne n'ouvrait, et le serveur
 * démarrait sur le simulateur. Rien ne plantait : on voyait un match de
 * démonstration et on se demandait pourquoi le vrai n'arrivait pas. C'est la
 * pire sorte de panne — silencieuse, et crédible.
 *
 * ── La règle de priorité ────────────────────────────────────────────────────
 *
 * Une variable DÉJÀ posée dans l'environnement gagne toujours sur le fichier.
 * `KZ_PROVIDER=simulator pnpm dev` doit l'emporter sur le `.env`, sinon on ne
 * peut plus rien forcer le temps d'un essai.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Pose dans `process.env` ce que le fichier déclare. Renvoie les noms chargés.
 * Pas de fichier, pas d'erreur : c'est le cas normal en production.
 */
export function chargerEnv(chemin = '.env'): string[] {
  const complet = resolve(process.cwd(), chemin);
  if (!existsSync(complet)) return [];

  let texte: string;
  try {
    texte = readFileSync(complet, 'utf8');
  } catch {
    return [];
  }

  const poses: string[] = [];
  for (const ligne of texte.split('\n')) {
    const net = ligne.trim();
    if (net === '' || net.startsWith('#')) continue;

    const coupure = net.indexOf('=');
    if (coupure <= 0) continue;

    const nom = net.slice(0, coupure).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) continue;
    // Déjà posée à la main : on n'y touche pas.
    if (process.env[nom] !== undefined) continue;

    let valeur = net.slice(coupure + 1).trim();
    const guillemet = valeur[0];
    if ((guillemet === '"' || guillemet === "'") && valeur.endsWith(guillemet)) {
      valeur = valeur.slice(1, -1);
    }
    process.env[nom] = valeur;
    poses.push(nom);
  }
  return poses;
}
