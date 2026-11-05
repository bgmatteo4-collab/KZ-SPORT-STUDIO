#!/usr/bin/env python3
"""
Refuse le CSS et les dépendances qu'OBS ne sait pas rendre.

POURQUOI CE SCRIPT EXISTE. J'ai introduit `color-mix()` deux fois dans ce
projet après avoir moi-même signalé qu'OBS ne le supporte pas. Une règle qu'on
se répète ne tient pas ; un script, si.

OBS Studio 30.0 embarque CEF 103, soit les capacités de Chrome 103. Les
versions suivantes montent à CEF 120, mais on ne choisit pas la version qu'a
l'utilisateur le soir du match : on vise la plus basse encore en circulation.

Un échec ici n'est pas une préférence de style. C'est une règle qui, non
respectée, donne un overlay cassé à l'antenne — sans message d'erreur, sans
rien dans la console, juste une couleur transparente ou un sélecteur ignoré.

    python3 tools/lint-obs-css.py
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Ce qui part dans OBS : la feuille de l'overlay et sa page. La régie, elle,
# tourne dans un vrai navigateur et n'est pas concernée.
CIBLES = [
    ROOT / 'apps/overlay/src/style.css',
    ROOT / 'apps/overlay/index.html',
]

CHROME_MINIMUM = 103

# (motif, version de Chrome qui l'introduit, ce qu'il faut faire à la place)
INTERDITS: list[tuple[str, int, str]] = [
    (r'color-mix\s*\(', 111, "superposer un dégradé rgba() sur la couleur de base"),
    (r':has\s*\(', 105, "poser une classe explicite depuis le widget"),
    (r'@container\b', 105, "lire la taille du créneau dans le widget (ctx.box)"),
    (r'text-wrap\s*:\s*(balance|pretty)', 114, "couper le texte à la main, ou laisser filer"),
    (r'\boklch\s*\(', 111, "donner la couleur en hex ou en rgb()"),
    (r'\boklab\s*\(', 111, "donner la couleur en hex ou en rgb()"),
    (r'\blab\s*\(', 111, "donner la couleur en hex ou en rgb()"),
    (r'\blch\s*\(', 111, "donner la couleur en hex ou en rgb()"),
    (r':nth-child\([^)]*\bof\b', 111, "filtrer la liste dans le widget"),
    (r'@scope\b', 118, "préfixer les sélecteurs"),
    (r'\banchor\s*\(', 125, "positionner en pixels du plateau"),
    (r'animation-timeline\s*:', 115, "animer en JavaScript ou en transition"),
    (r'\bfield-sizing\s*:', 123, "fixer la taille"),
    (r'\blight-dark\s*\(', 123, "déclarer les deux thèmes en jetons"),
    (r'@starting-style\b', 117, "une image d'attente avant d'animer, comme le fait le compositeur"),
]

# Une ressource distante est un pari pris à l'antenne : si le réseau est lent
# ou coupé au lancement d'OBS, le direct commence sans elle.
DISTANT = re.compile(r'(?:src|href|url\()\s*=?\s*["\']?(https?://[^"\'\)\s]+)')

# Les commentaires parlent justement de ces motifs : on ne les inspecte pas.
BLOC_COMMENTAIRE = re.compile(r'/\*.*?\*/', re.S)
LIGNE_COMMENTAIRE_HTML = re.compile(r'<!--.*?-->', re.S)


def sans_commentaires(texte: str, html: bool) -> str:
    """Remplace chaque commentaire par des espaces, en gardant les positions."""
    motif = LIGNE_COMMENTAIRE_HTML if html else BLOC_COMMENTAIRE
    return motif.sub(lambda m: ' ' * len(m.group(0)), texte)


def ligne_de(texte: str, index: int) -> int:
    return texte.count('\n', 0, index) + 1


def main() -> int:
    plaintes: list[str] = []

    for chemin in CIBLES:
        if not chemin.exists():
            plaintes.append(f'{chemin.relative_to(ROOT)} : fichier introuvable')
            continue

        brut = chemin.read_text()
        texte = sans_commentaires(brut, html=chemin.suffix == '.html')
        court = chemin.relative_to(ROOT)

        for motif, depuis, remede in INTERDITS:
            for trouve in re.finditer(motif, texte, re.I):
                plaintes.append(
                    f'{court}:{ligne_de(texte, trouve.start())} — '
                    f'« {trouve.group(0).strip()} » demande Chrome {depuis}, '
                    f'OBS en a {CHROME_MINIMUM}. À la place : {remede}.'
                )

        for trouve in DISTANT.finditer(texte):
            url = trouve.group(1)
            plaintes.append(
                f'{court}:{ligne_de(texte, trouve.start())} — ressource distante '
                f'« {url[:60]} ». À l\'antenne, une ressource réseau est un pari : '
                'embarquer le fichier.'
            )

    if plaintes:
        print('✗ incompatibilités OBS :\n')
        for p in plaintes:
            print(f'  {p}')
        print(f'\n{len(plaintes)} problème(s). Voir docs/CONCEPTION.md, règle n°5.')
        return 1

    cibles = ', '.join(str(c.relative_to(ROOT)) for c in CIBLES)
    print(f'✓ compatible CEF {CHROME_MINIMUM} (OBS 30) — {cibles}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
