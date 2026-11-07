#!/usr/bin/env python3
"""
Embarque les polices du projet, en base64.

POURQUOI. Une police chargée depuis le réseau est un pari pris à l'antenne :
si la requête est lente ou coupée au lancement d'OBS, le direct commence avec
la mauvaise police. C'est arrivé ici même — le navigateur de test n'avait pas
accès au réseau et toutes les captures tournaient en police de repli, sans que
rien ne le signale.

Embarquée, la police est toujours là : en développement, dans OBS, et dans la
page autonome. Une seule source, aucun pari.

    python3 tools/embed-font.py
"""
import base64
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Deux cibles, deux rôles.
#
# L'ANTENNE tient par l'unité : une seule famille, dont la hiérarchie vient de
# la graisse et de la chasse. C'est Archivo, et ça ne bouge pas.
#
# L'OUTIL est un logiciel, pas une émission : il lui faut la police de la
# marque — Inter Tight pour l'interface, JetBrains Mono pour tout ce qui est
# chiffre ou chemin de fichier. Un nombre en chasse fixe ne danse pas quand il
# change, et un décalage qu'on lit en direct ne doit pas danser.
#
# Les trois familles sont sous licence SIL OFL 1.1, qui autorise explicitement
# l'incorporation dans un logiciel ; le dépôt est public, d'où la mention dans
# l'en-tête de chaque fichier généré.
CIBLES = (
    {
        'sortie': 'apps/overlay/src/font.css',
        'quoi': "Archivo, pour l'antenne",
        'familles': ('Archivo:wdth,wght@62..125,100..900',),
    },
    {
        'sortie': 'apps/regie/src/font.css',
        'quoi': 'Inter Tight et JetBrains Mono, pour la régie',
        'familles': ('Inter+Tight:wght@400..800', 'JetBrains+Mono:wght@400..700'),
    },
)
# `latin` couvre les accents courants (É, Ã, Ú) ; `latin-ext` les diacritiques
# slaves des noms de joueurs (Č, Ć, Ş). Les autres sous-ensembles sont inutiles
# pour du football européen et pèseraient pour rien.
VOULUS = ('latin', 'latin-ext')
AGENT = (
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
)


def recupere(url: str) -> bytes:
    done = subprocess.run(
        ['curl', '-sSfL', '-A', AGENT, url], capture_output=True, timeout=60
    )
    if done.returncode != 0:
        sys.exit(f"échec du téléchargement : {url}\n{done.stderr.decode()[:300]}")
    return done.stdout


def embarque(famille: str) -> list[tuple[str, str, int]]:
    url = f'https://fonts.googleapis.com/css2?family={famille}&display=block'
    css = recupere(url).decode('utf-8')
    blocs = []
    motif = r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})'
    for commentaire, bloc in re.findall(motif, css, re.S):
        if commentaire not in VOULUS:
            continue
        lien = re.search(r'url\((https://[^)]+\.woff2)\)', bloc)
        if not lien:
            continue
        woff2 = recupere(lien.group(1))
        b64 = base64.b64encode(woff2).decode('ascii')
        bloc = bloc.replace(
            lien.group(0), f"url(data:font/woff2;base64,{b64}) format('woff2')"
        )
        bloc = bloc.replace("format('woff2') format('woff2')", "format('woff2')")
        # `block` plutôt que `swap` : à l'antenne, mieux vaut un instant sans
        # texte qu'un changement de police visible une seconde après.
        bloc = bloc.replace('font-display: swap;', 'font-display: block;')
        nom = re.search(r"font-family:\s*'([^']+)'", bloc)
        blocs.append((f'{nom.group(1) if nom else famille} {commentaire}', bloc, len(woff2)))
    return blocs


for cible in CIBLES:
    blocs = []
    for famille in cible['familles']:
        blocs += embarque(famille)
    if not blocs:
        sys.exit(f"aucun sous-ensemble récupéré pour {cible['sortie']}")

    entete = (
        '/*\n'
        f" * {cible['quoi']}. Embarquée en base64.\n"
        ' * Générée par tools/embed-font.py — ne pas éditer à la main.\n'
        ' *\n'
        " * Une police chargée depuis le réseau est un pari pris à l'antenne : si la\n"
        ' * requête est lente ou coupée au lancement, le direct commence avec la\n'
        " * mauvaise police. C'est arrivé ici même. Embarquée, elle est toujours là.\n"
        ' *\n'
        ' * Licence SIL Open Font License 1.1, qui autorise explicitement\n'
        " * l'incorporation dans un logiciel — y compris redistribué.\n"
        ' */\n\n'
    )
    out = ROOT / cible['sortie']
    out.write_text(entete + '\n\n'.join(b for _, b, _ in blocs) + '\n')
    for nom, _, taille in blocs:
        print(f'  {nom:<28} {taille / 1024:6.1f} Ko')
    print(f"✓ {cible['sortie']} — {out.stat().st_size / 1024:.0f} Ko en base64\n")
