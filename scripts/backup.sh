#!/usr/bin/env bash
# Backup next-wiki PostgreSQL data and content bind volume.
# Designed to run on the host where docker-compose.prod.yml volumes live.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATA_DIR="${DATA_DIR:-./data}"
POSTGRES_USER="${POSTGRES_USER:-wiki}"
POSTGRES_DB="${POSTGRES_DB:-wiki}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DB_CONTAINER="${DB_CONTAINER:-next-wiki-db}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "${BACKUP_DIR}"

DB_BACKUP="${BACKUP_DIR}/wiki-${TIMESTAMP}.sql.gz"
CONTENT_BACKUP="${BACKUP_DIR}/content-${TIMESTAMP}.tar.gz"

echo "== Backing up database to ${DB_BACKUP} =="
if docker ps --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
  docker exec "${DB_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${DB_BACKUP}"
else
  echo "Warning: container ${DB_CONTAINER} is not running; skipping database backup." >&2
fi

if [ -d "${DATA_DIR}/content" ]; then
  echo "== Backing up content volume to ${CONTENT_BACKUP} =="
  tar -czf "${CONTENT_BACKUP}" -C "${DATA_DIR}" content
else
  echo "== No ${DATA_DIR}/content directory found; skipping content backup =="
fi

echo "== Pruning backups older than ${BACKUP_RETENTION_DAYS} days =="
find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name 'wiki-*.sql.gz' -o -name 'content-*.tar.gz' \) -mtime +"${BACKUP_RETENTION_DAYS}" -delete

echo "== Backup complete =="
ls -lh "${BACKUP_DIR}/wiki-${TIMESTAMP}.sql.gz" "${BACKUP_DIR}/content-${TIMESTAMP}.tar.gz" 2>/dev/null || true
