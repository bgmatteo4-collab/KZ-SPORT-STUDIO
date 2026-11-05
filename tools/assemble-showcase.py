#!/usr/bin/env python3
"""
Assemble la vitrine en une page unique, autonome et publiable.

`vite build` produit un bundle `iife` et une feuille de style séparés ; ce
script les met en ligne dans une page sans squelette HTML — c'est ce
qu'attend l'hébergement d'artefact, qui fournit le sien.

    pnpm showcase
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist-showcase'

css_file = DIST / 'kz-studio.css'
js_file = DIST / 'showcase.js'
if not css_file.exists() or not js_file.exists():
    sys.exit("Lance d'abord `vite build --config vite.showcase.config.ts`.")

# La police est embarquée dans la feuille construite : aucun lien externe, donc
# la page s'affiche juste même hors ligne.
HEAD = '''<title>KZ Studio</title>
<meta name="claude:viewport-fit-sides" content="cover">
'''

BODY = (ROOT / 'apps/showcase/page.html').read_text()
CHROME = (ROOT / 'apps/showcase/page.css').read_text()

page = (
    HEAD
    + '\n<style>\n/* L’habillage lui-même, tel qu’il sort dans OBS */\n'
    + css_file.read_text()
    + '\n\n/* La page qui l’entoure */\n'
    + CHROME
    + '\n</style>\n\n'
    + BODY
    + '\n<script>\n'
    + js_file.read_text()
    + '\n</script>\n'
)

out = DIST / 'kz-studio.html'
out.write_text(page)
print(f"✓ {out.relative_to(ROOT)} — {len(page) / 1024:.0f} Ko")
