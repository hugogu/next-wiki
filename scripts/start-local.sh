#!/usr/bin/env bash
# One-command local deploy: build+start the default docker-compose.yml stack,
# wait for the web container to become healthy, then open it in a browser.
#
# This is a UX wrapper, not a new deployment path: every var it relies on
# already has an inline default in docker-compose.yml, so `docker compose up
# -d --build` alone works with zero setup. This script only adds progress
# feedback, a readiness wait, and an auto-opened browser tab — a local-demo
# complement to the documented Docker deployment (docs/deployment.md), not a
# replacement for it.
#
# Usage: scripts/start-local.sh  (or: pnpm quickstart)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed or not on PATH." >&2
  echo "  Install Docker Desktop (or Engine): https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: 'docker compose' (v2 plugin) is not available." >&2
  echo "  Update Docker Desktop, or install the compose plugin." >&2
  exit 1
fi

WEB_PORT="${WEB_PORT:-3000}"
if [ -f .env ] && grep -qE '^WEB_PORT=' .env; then
  WEB_PORT="$(grep -E '^WEB_PORT=' .env | tail -1 | cut -d= -f2-)"
fi

echo "==> starting next-wiki (build + db + web)"
docker compose up -d --build

echo "==> waiting for http://localhost:${WEB_PORT}/healthz"
TIMEOUT=300
deadline=$(($(date +%s) + TIMEOUT))
status=""
while [ "$(date +%s)" -lt "${deadline}" ]; do
  status=$(curl -s -o /dev/null -w '%{http_code}' -m 3 "http://localhost:${WEB_PORT}/healthz" || true)
  if [ "${status}" = "200" ]; then
    break
  fi
  echo -n "."
  sleep 2
done
echo

if [ "${status}" != "200" ]; then
  echo "ERROR: web did not become healthy within ${TIMEOUT}s (last status: ${status:-<none>})" >&2
  echo "  inspect with: docker compose logs web --tail 100" >&2
  exit 1
fi

URL="http://localhost:${WEB_PORT}"
echo "==> next-wiki is up at ${URL}"
echo "==> first run? create the admin account at ${URL}/setup"

open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$1" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1
  elif command -v wslview >/dev/null 2>&1; then
    wslview "$1" >/dev/null 2>&1
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process '$1'" >/dev/null 2>&1
  else
    return 1
  fi
}

open_url "${URL}" || echo "  (could not auto-open a browser; open ${URL} manually)"

echo
echo "==> stop with: docker compose down"
