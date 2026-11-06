# Les emblèmes de compétition

Dépose ici un fichier **nommé d'après le code de la compétition**, et il
remplacera celui du fournisseur à l'antenne.

```
assets/competitions/fra.1.png            ← Ligue 1
assets/competitions/uefa.champions.svg   ← Ligue des Champions
assets/competitions/fra.coupe_de_france.png
```

Formats acceptés : `.svg`, `.png`, `.webp`, `.jpg`. Le premier trouvé gagne,
dans cet ordre.

## Pourquoi ce dossier existe

ESPN sert les emblèmes de compétition, mais il les date de **mai 2019** et ne
les a jamais remis à jour. Son logo de Ligue 1 est encore celui d'avant 2020,
en gris. On ne peut pas corriger ESPN ; on peut te laisser imposer le bon.

Sans fichier ici, l'overlay retombe sur l'emblème du fournisseur. Rien ne
casse — c'est juste moins à jour.

## Quel code pour quelle compétition

Le code est celui qu'affiche le sélecteur de match, et celui des commandes :

| Compétition | Code |
|---|---|
| Ligue 1 | `fra.1` |
| Ligue 2 | `fra.2` |
| Coupe de France | `fra.coupe_de_france` |
| Ligue des Champions | `uefa.champions` |
| Ligue Europa | `uefa.europa` |
| Ligue Conférence | `uefa.europa.conf` |
| Premier League | `eng.1` |
| Liga | `esp.1` |
| Serie A | `ita.1` |
| Bundesliga | `ger.1` |

`pnpm espn live` affiche le code de chaque match en cours.

## Un conseil sur les fichiers

- **Du SVG si tu peux** : il reste net quel que soit l'agrandissement.
- **Fond transparent**. Le cartouche de compétition est doré ; un logo sur
  fond blanc y fera un rectangle.
- **Version sombre du logo**, pour la même raison.

## Ce dossier n'est pas versionné

Les images déposées ici sont ignorées par git : ce dépôt est public, et les
emblèmes de compétition sont des marques déposées qui ne nous appartiennent
pas. Elles restent sur ta machine.

Si tu préfères les versionner malgré tout, retire la ligne
`assets/competitions/*` de `.gitignore` — c'est ton dépôt, c'est ta décision.
