#!/bin/bash
set -e

run_backup_before_exit() {
  echo "[$(date)] Signal d'arrêt reçu. Backup avant arrêt..."

  /bin/bash /usr/local/bin/backup.sh || {
    echo "[$(date)] Erreur pendant le backup avant arrêt"
  }

  echo "[$(date)] Arrêt du conteneur backup."
  exit 0
}

trap run_backup_before_exit SIGTERM SIGINT

echo "[$(date)] Démarrage du cron backup..."

crond -f -l 8 &

CRON_PID=$!

wait "$CRON_PID"