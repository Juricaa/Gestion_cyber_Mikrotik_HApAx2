#!/bin/bash
set -e

DATE=$(date +%F_%H-%M)
BACKUP_DIR="/backup"
BACKUP_FILE="${MYSQL_DATABASE}_${DATE}.sql.gz"

echo "[$(date)] Demarrage backup MariaDB..."

if [ -z "$MYSQL_HOST" ] || [ -z "$MYSQL_DATABASE" ] || [ -z "$MYSQL_USER" ] || [ -z "$MYSQL_PASSWORD" ]; then
  echo "Erreur: variables MYSQL_* manquantes"
  exit 1
fi

export MYSQL_PWD="$MYSQL_PASSWORD"

mariadb-dump \
  -h "$MYSQL_HOST" \
  -P "${MYSQL_PORT:-3306}" \
  -u "$MYSQL_USER" \
  "$MYSQL_DATABASE" | gzip > "$BACKUP_DIR/$BACKUP_FILE"

if [ ! -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
  echo "Erreur: fichier backup vide"
  exit 1
fi

find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +30 -delete

echo "[$(date)] Backup termine: $BACKUP_FILE"