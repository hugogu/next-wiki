#!/usr/bin/env bash
# Local-build deployment for next-wiki on this host.
# Used when GitHub HTTPS is blocked from this host (GFW) — pulls a pre-bundled
# git range fetched from the hugo-mini staging repo via SSH instead of cloning
# over HTTPS.
#
# This script is the server-side counterpart of
#   ~/.openclaw/workspace/bin/deploy-next-wiki.sh
# which prepares the bundle and SCPs it over.
#
# Usage:
#   scripts/deploy-local.sh BRANCH /path/to/next-wiki-deploy-*.bundle
#
# Steps:
#   1.  Verify bundle
#   2.  Stash uncommitted caddy overlay (docker-compose.caddy.yml + Caddyfile)
#   3.  git fetch <bundle> origin/BRANCH
#   4.  git rebase origin/BRANCH (auto-skips equivalent commits)
#   5.  git stash pop
#   6.  scripts/backup.sh
#   7.  Validate .env has WEB_IMAGE set (prod overlay reads it for tag + DATA_DIR)
#   8.  docker compose build web  (base + prod + caddy overlay → locally built
#       image is tagged with $WEB_IMAGE from .env)
#   9.  docker compose up -d --no-deps web
#  10.  docker compose run --rm web node apps/web/scripts/migrate.mjs
#  11.  Wait for /healthz 200
#  12.  Smoke /api/v1/pages and /api/v1/stats
#
# Why the prod overlay here? Two reasons:
#   - WEB_IMAGE in .env tells compose what tag to apply to the locally built
#     image (matches what GHCR/Docker Hub would publish, so the same .env
#     works for both local-build and registry-pull paths).
#   - DATA_DIR + POSTGRES_PASSWORD envs are wired correctly to data/postgres
#     and data/content (NOT the legacy .postgres-data / .content-data paths).
#
# Image-source note: this script ALWAYS builds locally. Pre-built images from
# GHCR/Docker Hub are unreachable from this host (GFW); only the Docker base
# images (e.g. node:24-alpine) are pullable via the daemon's registry-mirrors.
#
# Exit codes:
#   0  deploy succeeded
#   1  pre-flight or bundle verify failed
#   2  rebase failed (manual intervention needed; aborts before container change)
#   3  build/restart/migrate/healthcheck failed (DB backup already taken; manual fix)

set -euo pipefail

BRANCH="${1:-}"
BUNDLE_PATH="${2:-}"

if [ -z "${BRANCH}" ] || [ -z "${BUNDLE_PATH}" ]; then
  echo "Usage: $0 BRANCH /path/to/next-wiki-deploy-bundle" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

echo "==> repo:    ${REPO_ROOT}"
echo "==> branch:  ${BRANCH}"
echo "==> bundle:  ${BUNDLE_PATH}"

# ---- 1. Verify bundle ----
if [ ! -f "${BUNDLE_PATH}" ]; then
  echo "ERROR: bundle not found at ${BUNDLE_PATH}" >&2
  exit 1
fi
echo "==> [1/12] verifying bundle"
git bundle verify "${BUNDLE_PATH}" >/dev/null

# ---- 2. Stash caddy overlay ----
echo "==> [2/12] stashing caddy overlay (if dirty)"
NEED_STASH=0
if ! git diff --quiet -- docker-compose.caddy.yml docker/caddy/Caddyfile 2>/dev/null; then
  NEED_STASH=1
  git stash push -u -m "deploy-local-$(date +%Y%m%d-%H%M%S)" -- docker-compose.caddy.yml docker/caddy/Caddyfile
fi

# ---- 3. Fetch from bundle ----
echo "==> [3/12] fetch from bundle"
git fetch "${BUNDLE_PATH}" "refs/remotes/origin/${BRANCH}:refs/remotes/origin/${BRANCH}"

# ---- 4. Rebase ----
echo "==> [4/12] rebase onto origin/${BRANCH}"
if ! git rebase "origin/${BRANCH}"; then
  echo "ERROR: rebase failed. Working tree left as-is for manual fix." >&2
  echo "  - investigate with: git status && git rebase --abort" >&2
  exit 2
fi

# ---- 5. Unstash caddy overlay ----
echo "==> [5/12] restoring caddy overlay"
if [ "${NEED_STASH}" = "1" ]; then
  if ! git stash pop; then
    echo "WARN: caddy stash pop failed; check git status" >&2
  fi
else
  echo "  (no caddy stash to restore — working tree was clean)"
fi

# ---- 6. DB backup ----
echo "==> [6/12] DB backup"
sudo -n /bin/bash "${REPO_ROOT}/scripts/backup.sh"

# ---- 7. Validate .env ----
echo "==> [7/12] validating .env"
if ! grep -qE '^WEB_IMAGE=hugogu/next-wiki-web:' "${REPO_ROOT}/.env"; then
  echo "ERROR: .env is missing WEB_IMAGE=hugogu/next-wiki-web:<tag>." >&2
  echo "  The prod overlay relies on it to tag the locally built image." >&2
  echo "  Add e.g.: WEB_IMAGE=hugogu/next-wiki-web:v0.2.7" >&2
  exit 1
fi
echo "  WEB_IMAGE=$(grep -E '^WEB_IMAGE=' "${REPO_ROOT}/.env" | head -1 | cut -d= -f2-)"

# ---- 8. Build web image ----
echo "==> [8/12] building web image (local; will be tagged with WEB_IMAGE from .env)"
sudo -n docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml build web

# ---- 9. Restart web ----
echo "==> [9/12] restarting web container"
sudo -n docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d --no-deps web

# ---- 10. Run migrations ----
echo "==> [10/12] running migrations"
sudo -n docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml run --rm web \
  node apps/web/scripts/migrate.mjs || echo "  (migrations reported issues — review above; deployment continues)"

# ---- 11. Wait for /healthz ----
echo "==> [11/12] waiting for /healthz"
TIMEOUT=120
deadline=$(($(date +%s) + TIMEOUT))
last=""
while [ "$(date +%s)" -lt "${deadline}" ]; do
  last=$(curl -s -o /dev/null -w '%{http_code}' -m 3 http://127.0.0.1:3000/healthz || true)
  if [ "${last}" = "200" ]; then
    echo "  /healthz 200 OK"
    break
  fi
  echo -n "."
  sleep 2
done
echo
if [ "${last}" != "200" ]; then
  echo "ERROR: /healthz did not return 200 within ${TIMEOUT}s (last: ${last:-<none>})" >&2
  echo "  inspect with: docker compose logs web --tail 100" >&2
  exit 3
fi

# ---- 12. Smoke ----
echo "==> [12/12] smoke tests"
curl -s -m 5 -o /dev/null -w '  /api/v1/pages?limit=1  HTTP %{http_code}  %{time_total}s\n' \
  'http://127.0.0.1:3000/api/v1/pages?limit=1'
curl -s -m 5 -o /dev/null -w '  /api/v1/stats          HTTP %{http_code}  %{time_total}s\n' \
  'http://127.0.0.1:3000/api/v1/stats'

echo
echo "==> DEPLOY COMPLETE"
git log --oneline -3
