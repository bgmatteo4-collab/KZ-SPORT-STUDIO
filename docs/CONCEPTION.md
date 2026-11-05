# KZ Studio — document de conception

> Ce document est la référence du projet. Toute décision tranchée y est écrite.
> **Si le code et ce document divergent, l'un des deux est un bug.**

---

## 1. En une phrase

Un moteur d'habillage broadcast pour watchalongs football : il sort deux sources
navigateur transparentes dans OBS, pilotées par une régie, qui affichent l'état
réel d'un match **décalé pour coller à ton stream**.

## 2. Ce que c'est, ce que ce n'est pas

| Ce n'est pas | C'est |
|---|---|
| Un site web | Un moteur de rendu temps réel à canevas fixe 1920×1080 |
| Une collection de widgets flottants | Un **compositeur de scènes** où la webcam est une couche à part entière |
| Un tableau de bord qui affiche des données | Du netcode : serveur autoritaire, client qui interpole |
| Un outil qui court après le direct | Un lecteur qui lit volontairement dans le passé |

## 3. Décisions verrouillées

| Sujet | Décision |
|---|---|
| Sport | **Football uniquement.** Rien d'autre. |
| Locataires | **Mono-chaîne** (KZ TV). La config est néanmoins séparée du moteur pour qu'une ouverture future ne soit pas une réécriture. |
| Fournisseur de données | **Sportmonks** (seul à documenter publiquement `ballCoordinates`). Derrière une interface `Provider` : on doit pouvoir en changer sans toucher au rendu. |
| Latence | **Le retard est une fonctionnalité, pas un problème.** On ne cherche jamais le temps réel. |
| Source de vérité | **Timeline append-only horodatée.** L'état est toujours `reduce(événements, t)`. |
| Autorité | Le serveur possède la timeline. L'overlay n'émet jamais d'état, seulement des intentions. |
| Chrono | Piloté localement depuis un **ancrage** (temps mural ↔ chrono match). Les corrections sont lissées. **Jamais de saut.** |
| Rendu | `transform` et `opacity` uniquement. Aucun reflow pendant une animation. |
| Flux OBS | **Deux sources navigateur** : `?layer=bg` et `?layer=fg`, webcam en sandwich entre les deux. |
| Webcam | Couche de première classe. Chaque scène déclare son rectangle cible. Deux modes : `obs` (pilotage d'OBS via obs-websocket, qualité et filtres conservés) et `browser` (getUserMedia, zéro configuration). |
| Habillages | **Des données.** Zéro couleur, marge ou durée d'animation en dur hors du thème. |
| Widgets | **Un widget = un module déclaré dans un registre**, qui déclare la tranche d'état dont il a besoin. Pas de logique à écrire pour en ajouter un. |
| Test | **Le simulateur est un citoyen de première classe.** On enregistre de vrais matchs et on les rejoue. On ne débuggue pas à 21 h un soir de Ligue des Champions. |
| Langue du code | TypeScript partout, types partagés entre serveur, overlay et régie. C'est ce qui empêche la désynchronisation. |
| Déploiement | Un petit VPS, Caddy, systemd. Pas de complexité cloud pour une chaîne. |

## 4. L'architecture

```
Sportmonks  ─┐
Simulateur  ─┤──▶  Provider (interface)
Saisie régie ┘           │
                         │ événements normalisés, horodatés
                         ▼
                  ╔══════════════╗
                  ║   TIMELINE   ║   append-only, numéros de séquence
                  ╚══════════════╝   ◀── clé de voûte
                         │
                         │ reduce(events, t) → MatchState   (fonction PURE)
                         ▼
              Passerelle WebSocket  (snapshot + deltas, reprise par seq)
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
   OVERLAY (bg + fg)                  RÉGIE
   rend t = maintenant − délai        scènes, délai, déclenchements
   60 fps, canevas fixe                     │
                                            ▼
                                     obs-websocket
                                     (transform de la webcam)
```

### Pourquoi ça marche là où les tentatives précédentes échouaient

1. **Le retard devient un curseur.** Ton stream a 20 à 60 s de retard. On ne
   cherche donc pas des données rapides : on cherche des données horodatées, et
   on les lit en retard. Tous les problèmes de synchronisation se réduisent à un
   seul nombre, réglable en direct.

2. **L'état est une fonction pure du temps.** Pas de mutation, pas de « il a raté
   un message donc il est faux pour toujours ». À n'importe quel instant, on
   recalcule depuis zéro.

3. **Le test qui compte : recharger en pleine mi-temps.** L'overlay doit être
   juste en moins d'une seconde. Si ce test passe, il n'y a plus de scénario de
   panne en direct : F5 répare tout.

4. **Le chrono ne saute pas.** L'API dit « minute 34 » toutes les 15 à 30 s. On
   n'écrit jamais cette valeur à l'écran : on pose un ancrage et on fait tourner
   l'horloge localement, en lissant les écarts.

## 5. Le modèle de données

Un seul modèle interne, indépendant du fournisseur. Chaque adaptateur traduit
vers celui-ci — jamais l'inverse.

### Événements (`MatchEvent`)

Horodatés en temps mural UTC, numérotés en séquence monotone, **idempotents**.

| Type | Rôle |
|---|---|
| `phase` | Changement de période + ancrage de chrono |
| `clock` | Ancrage : chrono match à un instant mural, en marche ou arrêté |
| `score` | Correction autoritaire du score |
| `goal` `card` `substitution` | Faits de jeu nommés |
| `corner` `shot` `free_kick` `offside` `penalty` | Faits de jeu pour le radar |
| `attack` | Camp + intensité : `none` / `attack` / `dangerous` |
| `ball` | Position normalisée `x`, `y` dans `[0,1]` |
| `stats` | Instantané : possession, tirs, xG, corners… |
| `lineup` | Formation + joueurs |
| `rating` | Notes des joueurs |

**Le radar consomme `ball`, point.** Si le fournisseur donne les coordonnées, on
les utilise ; sinon on les **dérive** de `attack` + `corner` + `shot` par une
machine à états qui produit une trajectoire plausible. Le renderer ne sait pas
laquelle des deux il affiche : c'est tout le bénéfice de l'abstraction.

### État (`MatchState`)

Le résultat du réducteur. Jamais construit à la main, jamais muté.

## 6. Les scènes et la webcam

Une **scène** est une composition nommée. C'est l'unité que la régie commute.

```ts
type Scene = {
  id: string;
  name: string;
  cam: Rect | null;              // où va la webcam — null = masquée
  camStyle: 'full' | 'rounded' | 'circle' | 'framed';
  layers: SceneLayer[];          // widget + emplacement + profondeur
  transition: { kind: 'cut' | 'fade' | 'slide' | 'wipe'; ms: number };
};
```

`Rect` est normalisé sur `[0,1]`, donc indépendant de la résolution.

Chaque couche porte un `z`. La constante `CAM_Z` coupe le monde en deux :
tout ce qui est en dessous part dans `?layer=bg`, tout ce qui est au-dessus dans
`?layer=fg`. **La webcam vit exactement sur `CAM_Z`.**

Quand la régie commute une scène :

1. Les deux overlays reçoivent la nouvelle scène et animent leurs couches.
2. La régie envoie le `cam` rect à OBS (`SetSceneItemTransform`), qui anime la
   vraie webcam sur la même durée et la même courbe.
3. L'overlay `fg` dessine le cadre, le masque et l'ombre autour de la caméra.

Scènes prévues au catalogue : `attente`, `avant-match`, `plein-cadre`,
`match` (vignette), `radar-2d`, `radar-3d-plein`, `stats-plein`, `compos`,
`debrief`, `multiplex`, `pause`.

## 7. Inventaire des widgets

Objectif : parité avec les 16 widgets Premium, plus les nôtres.

| # | Widget | Phase |
|---|---|---|
| 1 | Scorebug compact | 1 |
| 2 | Scorebug étendu (buteurs) | 1 |
| 3 | Chrono / temps additionnel / fin de période | 1 |
| 4 | Carton plein écran (but, carton rouge, remplacement) | 1 |
| 5 | Bandeau titre / sponsor | 1 |
| 6 | Radar 2D | 2 |
| 7 | Stats comparatives (possession, tirs, corners, xG) | 2 |
| 8 | Pressure index / momentum | 2 |
| 9 | Compositions et formations | 3 |
| 10 | Notes des joueurs | 3 |
| 11 | Avant-match (confrontations, forme) | 3 |
| 12 | Classement | 3 |
| 13 | Feuille de match | 3 |
| 14 | Radar 3D « plateau TV » | 4 |
| 15 | Multiplex / multiscore | 4 |
| 16 | Cadre webcam et habillage de scène | 1 |
| 17 | Sondage / interaction chat | 4 |

## 8. Les habillages

Un thème est un fichier de données : jetons de couleur, typographies, rayons,
inclinaisons, et assets. Injecté en propriétés CSS personnalisées à la racine.

Thèmes visés : générique KZ TV, Ligue 1, Ligue des Champions, Premier League,
Liga, Serie A, Bundesliga, Europa League, Conference, CAN, EURO, Coupe du Monde.
Puis les clubs.

## 9. La régie et le Stream Deck

La régie est une page web : liste des scènes, curseur de délai anti-spoiler,
déclenchements manuels, état de la connexion au fournisseur et à OBS, moniteur
de la timeline.

Le Stream Deck ne parle pas un protocole exotique : chaque touche appelle une
URL (`POST /cmd/scene/radar-3d-plein`). Compatible avec le plugin Web Requests,
Companion, ou n'importe quoi qui sait faire un HTTP.

## 10. Le simulateur

Deux usages :

- **Rejouer** un match enregistré (`fixtures/*.json`) à vitesse x1, x4 ou x20.
- **Générer** un match synthétique plausible pour éprouver les cas rares :
  but à la 90+5, carton rouge, trois remplacements d'un coup, coupure réseau,
  correction de score.

Tout enregistrement de match réel est conservé dans `fixtures/`. **Un bug vu en
direct devient une fixture**, et donc un test qui ne régresse plus.

## 11. Règles à respecter en contribuant

1. **Le serveur fait autorité.** L'overlay envoie des intentions, jamais des résultats.
2. **Aucune couleur, marge ou durée d'animation en dur** hors du thème.
3. **Le contenu est une donnée.** Un widget = une entrée dans le registre. Une scène = une entrée dans le catalogue. Pas de logique à écrire.
4. **Le réducteur est pur.** Aucun `Date.now()`, aucun accès réseau, aucun effet de bord dedans.
5. **Aucune animation qui provoque un reflow.** `transform` et `opacity`, rien d'autre.
6. **Tout widget doit survivre à l'absence de données.** Pas de donnée = pas d'affichage, jamais un `undefined` à l'antenne.

## 12. Phases

| Phase | Contenu | État |
|---|---|---|
| **0 — Fondations** | Modèle, timeline, réducteur, horloge + délai, simulateur, WebSocket, compositeur de scènes, overlay de test | en cours |
| **1 — Antenne** | Scorebug, chrono, cartons plein écran, cadre webcam, régie, thème KZ TV, pilotage OBS | à venir |
| **2 — Radar** | Radar 2D, dérivation du ballon, stats comparatives, pressure index | à venir |
| **3 — Profondeur** | Compos, notes, avant-match, classement, feuille de match, thèmes compétitions | à venir |
| **4 — Spectacle** | Radar 3D, multiplex, sondages, marketplace de thèmes clubs | à venir |

L'ordre n'est pas négociable sur un point : **la phase 0 doit passer le test du
rechargement avant qu'on écrive le premier widget.**
