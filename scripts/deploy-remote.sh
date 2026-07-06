#!/usr/bin/env bash
# Remote deployment script for next-wiki.
# Runs on the target host after GitHub Actions pushes a new image to GHCR.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
WEB_IMAGE="${WEB_IMAGE:-}"
APP_URL="${APP_URL:-http://localhost:3000}"
HEALTHCHECK_TIMEOUT_SECONDS="${HEALTHCHECK_TIMEOUT_SECONDS:-120}"

if [ -z "${WEB_IMAGE}" ]; then
  echo "Error: WEB_IMAGE is not set." >&2
  exit 1
fi

echo "== Pulling image ${WEB_IMAGE} =="
docker pull "${WEB_IMAGE}"

echo "== Updating containers =="
WEB_IMAGE="${WEB_IMAGE}" docker compose -f "${COMPOSE_FILE}" up -d --no-deps --pull never web

echo "== Running database migrations =="
docker compose -f "${COMPOSE_FILE}" run --rm web node apps/web/scripts/migrate.mjs

echo "== Waiting for /healthz =="
deadline=$(($(date +%s) + HEALTHCHECK_TIMEOUT_SECONDS))
last_code=""
while [ "$(date +%s)" -lt "${deadline}" ]; do
  last_code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "${APP_URL}/healthz" || true)
  if [ "${last_code}" = "200" ]; then
    echo " healthy"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo
echo "Error: app did not become healthy (last status: ${last_code:-<none>})" >&2
docker compose -f "${COMPOSE_FILE}" logs --no-color --no-log-prefix web --tail 100 || true
exit 1
