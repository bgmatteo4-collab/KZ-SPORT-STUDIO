#!/usr/bin/env bash
# Redémarre le serveur temps réel proprement.
#
# Deux pièges, rencontrés tous les deux pour de vrai :
#
#   1. `pkill -f` rate régulièrement sa cible : tsx lance un enfant dont la
#      ligne de commande ne ressemble pas à celle du parent. On tue donc par
#      PORT — la seule chose dont on soit sûr. `ss` n'est pas partout, d'où le
#      repli sur `fuser` puis `lsof`.
#
#   2. Vérifier « le port répond » ne prouve RIEN : si l'ancien serveur a
#      survécu, le nouveau meurt en EADDRINUSE et l'ancien répond à sa place.
#      On vérifie donc que NOTRE processus est vivant et que le journal est
#      propre, pas qu'une réponse arrive.
set -u
PORT="${KZ_PORT:-4100}"
LOG="${1:-/tmp/kz-server.log}"
cd "$(dirname "$0")/.." || exit 1

listeners() {
  if command -v fuser > /dev/null 2>&1; then
    fuser "$PORT/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$'
  elif command -v lsof > /dev/null 2>&1; then
    lsof -ti ":$PORT" -sTCP:LISTEN 2>/dev/null
  fi
}

for pid in $(listeners); do
  echo "arrêt du processus $pid sur le port $PORT"
  kill -9 "$pid" 2>/dev/null
done

for _ in $(seq 1 25); do
  [ -z "$(listeners)" ] && break
  sleep 0.2
done

if [ -n "$(listeners)" ]; then
  echo "le port $PORT reste occupé par : $(listeners)"
  exit 1
fi

: > "$LOG"
npx tsx apps/server/src/index.ts > "$LOG" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "le serveur s'est arrêté au démarrage :"
    tail -20 "$LOG"
    exit 1
  fi
  if grep -q 'EADDRINUSE' "$LOG"; then
    echo "port déjà pris — l'ancien serveur a survécu"
    exit 1
  fi
  if curl -fsS --noproxy '*' "http://localhost:$PORT/api/status" > /dev/null 2>&1; then
    echo "serveur prêt sur le port $PORT (pid $SERVER_PID, journal : $LOG)"
    exit 0
  fi
  sleep 0.25
done

echo "le serveur n'a pas répondu à temps :"
tail -20 "$LOG"
exit 1
