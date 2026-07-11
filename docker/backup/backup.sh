#!/bin/bash
set -Eeuo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backup}"
BACKUP_BASENAME="${MYSQL_DATABASE}_${DATE}"
BACKUP_FILE="${BACKUP_BASENAME}.zip"
TMP_DIR=$(mktemp -d)
SQL_FILE="${TMP_DIR}/${MYSQL_DATABASE}.sql"
TMP_ZIP="${BACKUP_DIR}/.${BACKUP_FILE}.tmp"
FINAL_ZIP="${BACKUP_DIR}/${BACKUP_FILE}"

cleanup() {
  rm -rf "$TMP_DIR"
  rm -f "$TMP_ZIP"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Démarrage backup MariaDB au format ZIP unifié..."

if [ -z "${MYSQL_HOST:-}" ] || [ -z "${MYSQL_DATABASE:-}" ] || [ -z "${MYSQL_USER:-}" ] || [ -z "${MYSQL_PASSWORD:-}" ]; then
  echo "Erreur: variables MYSQL_* manquantes"
  exit 1
fi

export MYSQL_PWD="$MYSQL_PASSWORD"

mariadb-dump \
  --host="$MYSQL_HOST" \
  --port="${MYSQL_PORT:-3306}" \
  --user="$MYSQL_USER" \
  --single-transaction \
  --quick \
  --default-character-set=utf8mb4 \
  --hex-blob \
  --skip-comments \
  --skip-add-locks \
  --skip-disable-keys \
  --skip-set-charset \
  --skip-tz-utc \
  --complete-insert \
  --extended-insert=FALSE \
  --add-drop-table \
  "$MYSQL_DATABASE" > "$SQL_FILE"

if [ ! -s "$SQL_FILE" ]; then
  echo "Erreur: fichier SQL vide"
  exit 1
fi

# Même structure que les sauvegardes créées depuis BackupPage.tsx :
# cyber_manager_YYYYMMDD_HHMMSS.zip -> cyber_manager.sql
zip -q -j - "$SQL_FILE" > "$TMP_ZIP"

if [ ! -s "$TMP_ZIP" ]; then
  echo "Erreur: archive ZIP vide"
  exit 1
fi

mv "$TMP_ZIP" "$FINAL_ZIP"

# Conservation 30 jours. Les anciens .sql.gz restent restaurables depuis le web.
find "$BACKUP_DIR" -type f \( -name "*.zip" -o -name "*.sql.gz" \) -mtime +30 -delete

echo "[$(date)] Backup terminé: $BACKUP_FILE"
