#!/usr/bin/env python3
"""
Embarque le motif d'encre diluée de la marque, en base64.

POURQUOI L'EMBARQUER. Le motif est la signature de la direction artistique :
il est sur toutes les scènes, en permanence. Chargé comme un fichier, il
dépend du serveur au moment précis où OBS ouvre la page — et une source
navigateur qui démarre sans son fond habillé, ça se voit à l'antenne. Même
raisonnement que pour la police.

Il pèse une trentaine de kilo-octets : c'est le prix d'une signature qui ne
peut pas manquer.

    python3 tools/embed-encre.py
"""
import base64
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/marque/encre.jpg'
SORTIE = ROOT / 'apps/overlay/src/encre.css'

brut = SOURCE.read_bytes()
b64 = base64.b64encode(brut).decode('ascii')

SORTIE.write_text(
    '/*\n'
    " * Le motif d'encre diluée de la marque, embarqué en base64.\n"
    ' * Généré par tools/embed-encre.py — ne pas éditer à la main.\n'
    ' *\n'
    " * C'est la signature de la direction artistique : teal et miel délavés\n"
    " * sur la nuit. Il est sur toutes les scènes, donc il ne peut pas dépendre\n"
    " * d'une requête qui arrive trop tard quand OBS ouvre la page.\n"
    ' */\n\n'
    ':root {\n'
    f'  --encre: url(data:image/jpeg;base64,{b64});\n'
    '}\n'
)
print(f'✓ {SORTIE.relative_to(ROOT)} — {len(brut) / 1024:.0f} Ko source, '
      f'{SORTIE.stat().st_size / 1024:.0f} Ko en base64')
