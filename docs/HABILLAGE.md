# L'habillage — spécification visuelle

> Écrite en observant le produit de référence en fonctionnement, pas sa page de
> vente. Les captures d'analyse restent hors du dépôt ; ce document est la seule
> source, et il décrit un langage visuel, pas des fichiers à copier.

---

## 1. Le principe qu'il ne faut pas rater

**L'habillage n'est pas un bandeau posé sur une image de match. C'est un plateau
de télévision qui occupe les 1920×1080, et la webcam est une case de ce plateau.**

Et on ne diffuse **jamais** les images du match. C'est la raison d'être d'un
watchalong, et la seule position tenable sur les droits : le plateau raconte la
rencontre par la donnée — score, radar, stats, compositions, multiplex.

Conséquence directe : la caméra ne flotte pas au-dessus du décor, elle est
**logée** dedans. Changer de scène, c'est redessiner le plateau et reloger la
caméra. C'est pour ça que le compositeur de scènes devait exister dès les
fondations.

## 2. La grille du plateau

```
┌──────────────────────────────────────────────────────────────────────┐
│ [écu]      ╭─ BANNIÈRE DE SCORE ────────────────────────╮      [écu] │
│  domicile  │  CHELSEA   2 │ 0   BARCELONE               │   extérieur│
│            ╰──────────────────────────────────────────────╯          │
│            ╭ buteurs ──────╮ ╭ 70:58 ╮ ╭ buteurs ───────╮            │
│                              ‾‾‾‾‾‾‾  ← soulignement or              │
│ ╭────────────────╮   ╭──────────────────────╮   ╭──────────────────╮ │
│ │ EN DIRECT      │   │                      │   │ DOMICILE         │ │
│ │ MATCHS         │   │      TA CAMÉRA       │   │ COMPOSITIONS     │ │
│ │  (multiplex)   │   │   (case centrale)    │   │   maillots       │ │
│ │                │   ╰──────────────────────╯   │   + noms         │ │
│ │                │   ╭──────────────────────╮   ╰──────────────────╯ │
│ │                │   │  RADAR              │   ╭──────────────────╮ │
│ ╰────────────────╯   │  [écu] terrain [écu]│   │ BOOKMAKER        │ │
│ ╭──────╮ ╭──────╮    │   xG          xG    │   │ COTES    1N2     │ │
│ │ 👁 24k│ │ 👍 8k│    ╰──────────────────────╯   ╰──────────────────╯ │
│ ╰──────╯ ╰──────╯                               ╭ ♪ pseudo ───────╮ │
└──────────────────────────────────────────────────────────────────────┘
```

Les panneaux latéraux sont **permanents** pendant le match. Ce sont leurs
contenus qui changent : le panneau de gauche porte le multiplex, ou les stats,
ou l'avant-match, selon la scène et le moment.

## 3. Le langage visuel

### Fond

Un dégradé profond, jamais noir, jamais transparent sur les scènes de plateau :
violet vers bleu nuit, avec une lueur radiale décentrée. Selon la compétition,
il porte en plus un motif discret — trame de points, diagonales, formes
organiques — qui ne doit jamais concurrencer la lecture.

### Panneaux

- Fond : bleu nuit très sombre, translucide (`rgba` autour de 78 % d'opacité)
- Bordure : 1 px de blanc à 10 %
- Rayon : 18 px
- Ombre portée large et douce, jamais dure

### En-têtes — la signature du produit

Deux niveaux, toujours :

```
  ▣  En direct          ← surtitre, 19 px, gris bleuté, graisse normale
     MATCHS             ← titre, 25 px, blanc, gras, capitales, interlettrage ouvert
```

Un pictogramme coloré à gauche. Les écus concernés alignés à droite.

### Bannière de score

La pièce maîtresse. Écus **en dehors** du bandeau, aux deux extrémités de
l'écran, grands (environ 110 px). Noms d'équipe en capitales très grasses
(57 px). Chaque chiffre du score dans son propre pavé plus clair. En dessous,
une rangée de trois pilules : buteurs domicile, **chrono**, buteurs extérieur.
Le chrono porte un **soulignement or** — c'est le seul endroit où l'or apparaît
en trait.

### Barres de statistique

Une seule barre continue à coins arrondis, coupée en deux segments. La valeur
domicile est incrustée à gauche **dans** la barre, la valeur extérieure à
droite. Le libellé est centré au-dessus, en petites capitales espacées.

La possession fait exception : c'est un **anneau**, pas une barre, avec les deux
pourcentages de part et d'autre et le mot au centre.

### Compositions

Des **maillots** dessinés (rayures ou uni selon le club), disposés selon la
formation sur un demi-terrain implicite. Sous chaque maillot, le nom en
capitales dans une pilule. Les marqueurs — carton jaune, carton rouge,
remplacement — sont de petits carrés ou triangles collés au coin du maillot. Le
gardien est distinct, en or.

### Radar

Le terrain prend la couleur sombre du thème, jamais le vert d'un vrai gazon.
Bandes de tonte en alternance très discrète. Lignes blanches à 40 %. À chaque
extrémité, une **plaque verticale portant l'écu**, et sous l'écu la valeur de
xG. Au centre du terrain, l'état du jeu en toutes lettres : « Chelsea —
Attaque dangereuse ». Des équerres marquent les quatre coins.

### Pilules

Tout ce qui est secondaire est une pilule à coins très arrondis : les buteurs,
les cotes, le compteur de vues, le pseudo social. Fond légèrement plus clair que
le panneau, texte compact.

## 4. Typographie

| Usage | Taille | Graisse | Casse |
|---|---|---|---|
| Nom d'équipe, bannière | 57 px | 800 | CAPITALES |
| Chiffre du score | 66 px | 800 | — |
| Titre de panneau | 25 px | 700 | CAPITALES, interlettrage 0,06 em |
| Surtitre de panneau | 19 px | 400 | Capitale initiale |
| Chrono | 33 px | 700 | — |
| Nom de joueur | 19 px | 700 | CAPITALES |
| Valeur de statistique | 30 px | 700 | chiffres tabulaires |
| Libellé de statistique | 18 px | 500 | petites capitales |

Une seule famille grotesque géométrique, très grasse dans les hautes tailles.

## 5. Couleurs

Ce sont des jetons, déclinés par compétition dans `packages/core/src/theme.ts`.

| Jeton | Rôle |
|---|---|
| `bgDeep`, `bgMid` | les deux arrêts du dégradé de fond |
| `glow` | la lueur radiale décentrée |
| `panel` | fond des panneaux |
| `panelLine` | bordure des panneaux |
| `pill` | fond des pilules |
| `ink`, `inkSoft` | texte principal, surtitres |
| `accent` | l'or : soulignement du chrono, gardien, détails |
| `live` | le rouge du direct |
| `pitch`, `pitchLine` | le radar |

Les couleurs d'équipe viennent des données du match, jamais du thème.

## 6. Mouvement

- Une scène entre et sort par **translation et opacité**, jamais par taille.
- Les barres de statistique s'animent par `scaleX`, jamais par largeur.
- Le ballon du radar est interpolé : les positions arrivent à 1 Hz, l'œil veut 60.
- Les cartons plein écran entrent en 320 ms et tiennent 5 s.
- **Aucune animation ne doit provoquer de recalcul de mise en page.**

## 7. Ce qu'on ne copie pas

Le découpage fonctionnel et les conventions d'antenne du football sont communs à
tout le métier : un scorebug avec écus et chrono, un radar, une liste de
compositions. On les reprend parce que ce sont des conventions, comme un
journal télévisé reprend le bandeau défilant.

En revanche, l'identité reste celle de KZ TV : palette, motifs de fond,
typographie et pictogrammes sont les nôtres. On ne reproduit aucun visuel, on
n'embarque aucun de leurs fichiers.
