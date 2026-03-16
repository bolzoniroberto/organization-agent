#!/bin/bash
# Ripristina hrplatform.db da un backup
# Uso: ./scripts/restore-db.sh [file_backup.db]
#   Senza argomenti: lista i backup disponibili
#   Con argomento:   ripristina dal file indicato

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DB_PATH="${DATABASE_PATH:-$PROJECT_DIR/hrplatform.db}"
BACKUP_DIR="$PROJECT_DIR/backups"

if [ -z "$1" ]; then
  echo "Backup disponibili:"
  ls -lht "$BACKUP_DIR"/hrplatform_*.db 2>/dev/null | awk '{print NR")", $NF, $5, $6, $7, $8}' || echo "  Nessun backup trovato"
  echo ""
  echo "Uso: $0 <file_backup.db>"
  exit 0
fi

BACKUP_FILE="$1"
# Se non è un percorso assoluto, cerca nella cartella backups
if [ ! -f "$BACKUP_FILE" ]; then
  BACKUP_FILE="$BACKUP_DIR/$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERRORE: File non trovato: $BACKUP_FILE"
  exit 1
fi

# Checkpoint WAL corrente prima del restore
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
fi

# Backup del DB attuale prima del restore
SAFEGUARD="$BACKUP_DIR/pre_restore_$(date +%Y%m%d_%H%M%S).db"
cp "$DB_PATH" "$SAFEGUARD"
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"

cp "$BACKUP_FILE" "$DB_PATH"
echo "Ripristinato: $BACKUP_FILE → $DB_PATH"
echo "Backup pre-restore salvato in: $SAFEGUARD"
echo "Riavvia il server Next.js (pm2 restart hr-platform) per applicare."
