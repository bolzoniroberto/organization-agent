#!/bin/bash
# Backup di hrplatform.db con WAL checkpoint
# Uso: ./scripts/backup-db.sh
# Cron giornaliero: 0 3 * * * /org-agent/scripts/backup-db.sh >> /org-agent/backups/backup.log 2>&1

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DB_PATH="${DATABASE_PATH:-$PROJECT_DIR/hrplatform.db}"
BACKUP_DIR="$PROJECT_DIR/backups"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup] ERRORE: DB non trovato in $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/hrplatform_${TIMESTAMP}.db"

# Checkpoint WAL nel file principale, poi copia atomica via sqlite3
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
  cp "$DB_PATH" "$BACKUP_FILE"
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') — $BACKUP_FILE ($SIZE)"

# Mantieni gli ultimi 14 backup giornalieri, elimina i più vecchi
ls -t "$BACKUP_DIR"/hrplatform_*.db 2>/dev/null | tail -n +15 | xargs rm -f

echo "[backup] Backup completati disponibili: $(ls "$BACKUP_DIR"/hrplatform_*.db 2>/dev/null | wc -l | tr -d ' ')"
