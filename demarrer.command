#!/usr/bin/env bash
# =============================================================================
#  KZ Studio — démarrage, macOS et Linux.
#
#  À double-cliquer dans le Finder, ou à lancer avec `./demarrer.command`.
#  Il vérifie Node, installe ce qu'il faut la première fois, écrit la
#  configuration, lance le serveur et ouvre la régie.
#
#  ── Pourquoi il n'installe rien globalement ─────────────────────────────────
#
#  `npm install -g` et `corepack enable` écrivent dans les dossiers système de
#  Node. Selon la façon dont Node a été installé sur un Mac, ça demande un mot
#  de passe administrateur — et un lanceur qui réclame le mot de passe root au
#  premier contact, c'est non. On passe donc par `npx`, qui ne pose rien
#  durablement sur la machine.
# =============================================================================

set -u
cd "$(dirname "$0")" || exit 1

PNPM_VERSION="10.28.0"

vert() { printf '\033[32m%s\033[0m\n' "$1"; }
rouge() { printf '\033[31m%s\033[0m\n' "$1"; }
gris() { printf '\033[90m%s\033[0m\n' "$1"; }

echo
echo "  KZ STUDIO"
echo "  ─────────"
echo

# ── 1. Node.js ───────────────────────────────────────────────────────────────
if ! command -v node > /dev/null 2>&1; then
  rouge "  ✗ Node.js n'est pas installé sur cette machine."
  echo
  echo "    J'ouvre la page de téléchargement. Prends la version « LTS »,"
  echo "    installe-la, puis relance ce fichier."
  echo
  command -v open > /dev/null 2>&1 && open "https://nodejs.org/fr/download"
  echo "    Si tu as Homebrew, c'est plus rapide :  brew install node"
  echo
  read -r -p "  Appuie sur Entrée pour fermer." _
  exit 1
fi

MAJEUR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJEUR" -lt 20 ]; then
  rouge "  ✗ Node $(node --version) est trop ancien ; il en faut au moins 20."
  echo "    Mets-le à jour depuis https://nodejs.org puis relance."
  read -r -p "  Appuie sur Entrée pour fermer." _
  exit 1
fi
vert "  ✓ Node $(node --version)"

# ── 2. pnpm, sans rien installer à demeure ───────────────────────────────────
if command -v pnpm > /dev/null 2>&1; then
  PNPM="pnpm"
else
  # `npx` télécharge pnpm dans son propre cache. Rien dans les dossiers système.
  PNPM="npx --yes pnpm@${PNPM_VERSION}"
  gris "  · pnpm absent : il sera utilisé via npx, sans installation globale"
fi
vert "  ✓ pnpm prêt"

# ── 3. La configuration, à la première ouverture ─────────────────────────────
if [ ! -f .env ]; then
  cat > .env <<'CONF'
# Configuration KZ Studio. Modifiable à la main.
# ESPN ne demande aucun jeton et couvre la Ligue 1 et la Ligue des Champions.
KZ_PROVIDER=espn
ESPN_LEAGUE=fra.1
KZ_MULTIPLEX=1
KZ_PORT=4100
CONF
  vert "  ✓ Configuration écrite dans .env"
fi

# ── 4. Les dépendances, une seule fois ───────────────────────────────────────
if [ ! -d node_modules ]; then
  echo
  echo "  Installation des dépendances. C'est long UNE SEULE FOIS :"
  echo "  compte deux à trois minutes. Ne ferme pas cette fenêtre."
  echo
  if ! $PNPM install; then
    echo
    rouge "  ✗ L'installation a échoué. Vérifie ta connexion, puis relance."
    read -r -p "  Appuie sur Entrée pour fermer." _
    exit 1
  fi
fi
vert "  ✓ Dépendances en place"

# ── 5. Le match de démonstration, pour pouvoir travailler hors ligne ─────────
if [ ! -f fixtures/demo-ucl.json ]; then
  gris "  · génération du match de démonstration"
  $PNPM fixture > /dev/null 2>&1 || true
fi

# ── 6. La régie s'ouvre quand le serveur a eu le temps de répondre ───────────
if command -v open > /dev/null 2>&1; then
  (
    for _ in $(seq 1 40); do
      if curl -fsS --max-time 1 http://localhost:4000/ > /dev/null 2>&1; then
        open "http://localhost:4000/regie/"
        exit 0
      fi
      sleep 0.5
    done
  ) &
fi

cat <<'FIN'

  ══════════════════════════════════════════════════════════════════════

   Régie          http://localhost:4000/regie/
   Banc d'essai   http://localhost:4000/preview/     (F = plein écran)

   DANS OBS, deux sources navigateur, 1920 × 1080 chacune :

     Arrière-plan   http://localhost:4000/overlay/?layer=bg
     ta webcam      ENTRE LES DEUX
     Avant-plan     http://localhost:4000/overlay/?layer=fg

   Dans la régie : touche  M  pour choisir le match.

   Pour tout arrêter : Ctrl+C, ou ferme cette fenêtre.

  ══════════════════════════════════════════════════════════════════════

FIN

$PNPM dev
