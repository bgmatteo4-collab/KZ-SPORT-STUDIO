# KZ Studio

Un moteur d'habillage broadcast pour watchalongs football. Il sort deux sources
navigateur transparentes dans OBS, pilotées par une régie, qui affichent l'état
réel d'un match **décalé pour coller à ton stream**.

- **[docs/CONCEPTION.md](docs/CONCEPTION.md)** — l'architecture et les décisions verrouillées
- **[docs/HABILLAGE.md](docs/HABILLAGE.md)** — la spécification visuelle du plateau

---

## Démarrer

```sh
pnpm install
pnpm fixture   # génère un match de démonstration rejouable
pnpm dev
```

Trois pages :

| Page | Adresse | À quoi ça sert |
|---|---|---|
| Prévisualisation | http://localhost:4000/preview/ | Voir le résultat final sans ouvrir OBS |
| Régie | http://localhost:4000/regie/ | Piloter : scènes, délai, habillage |
| Overlay | http://localhost:4000/overlay/?layer=fg | Ce qu'on colle dans OBS |

## Voir à quoi ça ressemble sans rien installer

```sh
pnpm showcase
```

Construit une page autonome dans `dist-showcase/` : le plateau complet qui
rejoue un vrai match enregistré, entièrement dans le navigateur. Aucun serveur,
aucun réseau une fois la page chargée. Pratique pour montrer le résultat ou
vérifier un habillage sur un téléphone.

## Dans OBS

Deux sources navigateur, 1920×1080, fond transparent, **ta webcam entre les
deux** dans la liste des sources :

```
Source navigateur   http://localhost:4000/overlay/?layer=fg
Ta webcam                      ← la scène décide où elle se place
Source navigateur   http://localhost:4000/overlay/?layer=bg
```

C'est cet empilement qui permet à la caméra d'être **logée dans le plateau**
plutôt que posée dessus.

Il n'y a rien d'autre dans la pile : **on ne diffuse jamais les images du
match**. C'est la raison d'être d'un watchalong, et le plateau raconte la
rencontre par la donnée — score, radar, stats, compositions, multiplex.

## Le réglage qui compte

Ton stream a 20 à 60 secondes de retard sur le direct. Le curseur
**anti-spoiler** de la régie décale l'habillage d'autant. Compare le chrono
affiché à celui de ton propre stream et ajuste à la seconde — c'est le seul
réglage qui demande ton œil, et il est modifiable en pleine rencontre.

## Stream Deck

Une touche = une URL. N'importe quel plugin sachant faire un GET suffit.

```
http://localhost:4100/api/scene/radar-plein
http://localhost:4100/api/delay/32000
http://localhost:4100/api/delay/nudge/-500
http://localhost:4100/api/theme/ucl
```

## Répéter sans attendre un vrai match

Le simulateur rejoue un match enregistré, accéléré si besoin. On ne débogue pas
un habillage à 21 h un soir de Ligue des Champions.

```sh
KZ_REPLAY_SPEED=20 pnpm dev:server    # 90 minutes en 4 min 30
KZ_START_AT=2700000 pnpm dev:server   # démarrer à la 45e minute
```

## Organisation du code

```
packages/
├── core/          le modèle, la timeline, le réducteur, l'horloge, les scènes, les thèmes
└── providers/     les sources de données : simulateur, Sportmonks
apps/
├── server/        la timeline autoritaire, le WebSocket, les URL Stream Deck
├── overlay/       la source navigateur : compositeur de scènes et widgets
├── regie/         le pupitre
└── preview/       l'empilement d'OBS, dans une page
```

## Règles à respecter en contribuant

1. **Le serveur fait autorité.** L'overlay envoie des intentions, jamais des résultats.
2. **Aucune couleur, marge ou durée d'animation en dur** hors du thème.
3. **Le contenu est une donnée.** Un widget = une entrée dans le registre. Une scène = une entrée dans le catalogue.
4. **Le réducteur est pur.** Aucun `Date.now()`, aucun réseau, aucun effet de bord dedans.
5. **Aucune animation qui provoque un reflow.** `transform` et `opacity`, rien d'autre.
6. **Tout widget survit à l'absence de données.** Jamais un `undefined` à l'antenne.

Et le test qui prime sur tous les autres : **recharger l'overlay en pleine
mi-temps doit le rendre juste en moins d'une seconde, sans rejouer aucune
animation.**
