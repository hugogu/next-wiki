#!/usr/bin/env bash
set -euo pipefail

# Promote an existing next-wiki user to admin.
# Usage: ./scripts/set-admin.sh <email>
# Requires the PostgreSQL container to be running.

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "Usage: $0 <email>"
  echo "Example: $0 gqq@outlook.com"
  exit 1
fi

DB_USER="${DB_USER:-wiki}"
DB_NAME="${DB_NAME:-wiki}"
DB_CONTAINER="${DB_CONTAINER:-next-wiki-db}"

if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  echo "Error: container '${DB_CONTAINER}' is not running."
  echo "Start it with: docker compose up -d"
  exit 1
fi

SQL="UPDATE users SET role = 'admin', updated_at = now() WHERE email = '${EMAIL}';"

ROWS=$(docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "SELECT COUNT(*) FROM users WHERE email = '${EMAIL}';")

if [ "$ROWS" -eq "0" ]; then
  echo "Error: user '${EMAIL}' does not exist. Register the account first."
  exit 1
fi

docker exec -i "${DB_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -c "${SQL}"

echo "User '${EMAIL}' has been set to admin."
