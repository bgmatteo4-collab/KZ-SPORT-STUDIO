#!/usr/bin/env python3
"""
Embarque Archivo dans le projet, en base64.

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
OUT = ROOT / 'apps/overlay/src/font.css'
URL = (
    'https://fonts.googleapis.com/css2'
    '?family=Archivo:wdth,wght@62..125,100..900&display=block'
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


css = recupere(URL).decode('utf-8')

blocs = []
for commentaire, bloc in re.findall(r'/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{.*?\})', css, re.S):
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
    # `block` plutôt que `swap` : à l'antenne, mieux vaut un instant sans texte
    # qu'un changement de police visible une seconde après l'apparition.
    bloc = bloc.replace('font-display: swap;', 'font-display: block;')
    blocs.append((commentaire, bloc, len(woff2)))

if not blocs:
    sys.exit('aucun sous-ensemble récupéré — la feuille Google a peut-être changé de forme')

entete = (
    '/*\n'
    " * Archivo, embarquée. Générée par tools/embed-font.py — ne pas éditer.\n"
    ' *\n'
    " * Une police chargée depuis le réseau est un pari pris à l'antenne. Celle-ci\n"
    " * est dans le fichier : elle est là en développement, dans OBS et dans la\n"
    ' * page autonome, réseau ou pas.\n'
    ' */\n\n'
)
OUT.write_text(entete + '\n\n'.join(b for _, b, _ in blocs) + '\n')

for nom, _, taille in blocs:
    print(f'  {nom:<10} {taille / 1024:6.1f} Ko')
print(f'✓ {OUT.relative_to(ROOT)} — {OUT.stat().st_size / 1024:.0f} Ko en base64')
