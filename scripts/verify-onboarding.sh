#!/usr/bin/env bash
# Fresh-instance onboarding smoke test.
#
# Asserts the full first-run experience against a running next-wiki instance:
#   1. A fresh instance (no admin) routes /, /auth/login, /auth/register to /setup.
#   2. No hard-coded admin@example.com is seeded in production.
#   3. POST /api/auth/setup creates the first admin and establishes a session.
#   4. Home renders (no redirect) once an admin exists.
#   5. The default space is seeded so the instance is writable right after setup.
#   6. The new admin can create + publish a page that is readable anonymously.
#
# This intentionally does not run as a unit/integration test: it needs a real
# built container + Postgres + HTTP, so it lives as a script driven by the
# onboarding-smoke GitHub Actions workflow (and can be run locally).
#
# Usage: ./scripts/verify-onboarding.sh [BASE_URL] [DB_CONTAINER]
#   BASE_URL       default http://localhost:3000   (or $BASE_URL)
#   DB_CONTAINER   default next-wiki-db            (or $DB_CONTAINER)
#
# Requires: curl, docker (to query Postgres inside the compose stack).
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:3000}}"
DB_CONTAINER="${2:-${DB_CONTAINER:-next-wiki-db}}"
DB_USER="${DB_USER:-wiki}"
DB_NAME="${DB_NAME:-wiki}"

ADMIN_EMAIL="owner@onboarding-smoke.test"
ADMIN_PASSWORD="OnboardingPass123!"
PAGE_PATH="onboarding-smoke-note"

pass=0
fail=0
cookie_jar="$(mktemp)"
trap 'rm -f "$cookie_jar"' EXIT

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

# check <description> <actual> <expected>
check() {
  local desc="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    green "PASS: $desc (got: $actual)"
    pass=$((pass + 1))
  else
    red   "FAIL: $desc — expected: $expected, got: $actual"
    fail=$((fail + 1))
  fi
}

db_scalar() {
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "$1" 2>/dev/null || true
}

echo "== Waiting for ${BASE_URL}/healthz =="
code=""
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "${BASE_URL}/healthz" || true)
  [ "$code" = "200" ] && break
  sleep 2
done
if [ "$code" != "200" ]; then
  red "FAIL: app never became healthy (last status: ${code:-<none>})"
  exit 1
fi

echo "== Onboarding assertions =="

# 1-3. Fresh instance redirects every natural entry point to /setup.
for path in "/" "/auth/login" "/auth/register"; do
  resp=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 10 "${BASE_URL}${path}")
  rcode="${resp%% *}"
  rloc="${resp##* }"
  check "GET ${path} status (no admin)" "$rcode" "307"
  case "$rloc" in
    */setup) green "PASS: GET ${path} redirects to /setup"; pass=$((pass + 1)) ;;
    *) red "FAIL: GET ${path} redirected to '${rloc}', expected .../setup"; fail=$((fail + 1)) ;;
  esac
done

# 4. /setup renders the guided form.
check "GET /setup status" \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 10 "${BASE_URL}/setup")" "200"

# 5. No hard-coded demo admin is seeded in production.
check "no admin@example.com seeded" \
  "$(db_scalar "SELECT count(*) FROM users WHERE email = 'admin@example.com';")" "0"

# 6. Create the first admin via the guided route (capture the session cookie).
check "POST /api/auth/setup status" \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "${BASE_URL}/api/auth/setup" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
      -c "$cookie_jar")" "200"

# 7. Home renders (no redirect) once an admin exists.
check "GET / status (admin exists)" \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 10 -b "$cookie_jar" "${BASE_URL}/")" "200"

# 8. The new user is an admin.
check "first user role" \
  "$(db_scalar "SELECT role FROM users WHERE email = '${ADMIN_EMAIL}';")" "admin"

# 9. Default space exists so the instance is writable immediately after setup.
check "default space seeded" \
  "$(db_scalar "SELECT count(*) FROM spaces WHERE slug = 'default';")" "1"

# 10. The admin can create a draft page.
check "POST /api/pages (create draft)" \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "${BASE_URL}/api/pages" \
      -H 'Content-Type: application/json' -b "$cookie_jar" \
      -d "{\"path\":\"${PAGE_PATH}\",\"title\":\"Onboarding Smoke\",\"contentSource\":\"# Smoke\nCreated right after first-run setup.\"}")" "201"

# 11. The admin publishes it.
check "POST /api/revisions/publish" \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST "${BASE_URL}/api/revisions/publish" \
      -H 'Content-Type: application/json' -b "$cookie_jar" \
      -d "{\"path\":\"${PAGE_PATH}\",\"version\":1}")" "200"

# 12. The published page is readable anonymously.
check "GET /${PAGE_PATH} (anonymous read)" \
  "$(curl -s -o /dev/null -w '%{http_code}' -m 10 "${BASE_URL}/${PAGE_PATH}")" "200"

echo
echo "== Results: ${pass} passed, ${fail} failed =="
[ "$fail" -eq 0 ] || exit 1
