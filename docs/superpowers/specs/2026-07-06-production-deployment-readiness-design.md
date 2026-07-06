# Production Deployment Readiness Assessment

Date: 2026-07-06  
Topic: First production deployment on self-hosted Docker + GitHub Actions

## Decision Context

- **Target users:** global audience.
- **Target host:** self-owned server in China Mainland or homelab; no public cloud assumption.
- **Network entry:** Cloudflare Tunnel (initial cost-saving phase); reverse proxy / SSL handled outside this project.
- **Deployment mechanism:** GitHub Actions builds and pushes container image to GHCR, then SSH into the host to pull and restart.
- **Project assumption:** next-wiki should stay unopinionated about TLS, reverse proxy, and DNS; it only needs to expose a plain HTTP port.

## Current State Summary

### What is already in place

| Area | Status | Notes |
|------|--------|-------|
| Build system | ✅ Good | pnpm workspaces + Turborepo; `pnpm build` / `lint` / `typecheck` all green. |
| Runtime stack | ✅ Good | Next.js 16 + React 19 + TypeScript 5 + PostgreSQL + Drizzle + pg-boss. |
| Database migrations | ✅ Good | 25 Drizzle migrations; `meta/` snapshot chain appears intact up to `0024`. |
| First-run setup | ✅ Good | `/setup` route creates the first admin only when no admin exists; no hard-coded production admin. |
| Health check | ✅ Good | `/healthz` endpoint uses `checkHealth()`. |
| Docker Compose | ⚠️ Partial | `docker-compose.yml` works for local dev but hardcodes dev-ish defaults and loops back ports. |
| Dockerfile | ⚠️ Partial | Builds, but hardcodes `registry.npmmirror.com`, making global builds slow/brittle. |
| CI/CD | ⚠️ Partial | E2E on PR, MCP publish on tag, onboarding smoke on label; no deploy workflow. |
| Image registry | ❌ Missing | No GHCR build/push flow. |
| Host deploy script | ❌ Missing | No remote pull/restart automation. |
| Observability | ❌ Missing | No structured logs, metrics, or alerting for production. |
| Backup / restore | ❌ Missing | PostgreSQL data and content volume are not backed up automatically. |
| Secrets management | ⚠️ Partial | `API_KEY_ENCRYPTION_KEY` has a dangerous zero-key default in `docker-compose.yml`. |
| Test stability | ⚠️ Partial | 8 tests fail by timeout locally; likely DB connection contention, not logic bugs. |

### Verified facts

- `pnpm lint`: **pass**.
- `pnpm typecheck`: **pass**.
- `pnpm test`: **1750 passed, 8 failed, 1 skipped**. Failures are all timeout-related in AI index, pages, content assets, and public content read suites.
- `docker compose build --no-cache web`: **fails** during `pnpm install --frozen-lockfile` from mainland China because `registry.npmmirror.com` drops connections.

## Production Readiness Verdict

**Not ready to deploy as-is**, but the gaps are mostly operational, not architectural. The application itself is feature-complete and type-safe. The blockers for a real first deploy are:

1. Container build must not assume a specific registry mirror.
2. Default secrets must not be silently accepted in production.
3. A repeatable, auditable deploy path must exist.
4. Backup and basic observability must be documented or automated.
5. Flaky tests should be stabilized or explained before claiming production readiness.

## Proposed Pre-Launch Scope

We will make the minimum set of changes so that a user can:

1. Build the image anywhere by configuring their own registry mirror.
2. Run the stack without accidentally using a default encryption key.
3. Push a new image to GHCR from GitHub Actions on every push to `main` (or tag).
4. SSH to a configured host and run the new image with zero manual steps.
5. Back up the database and content volume to a safe location.
6. Trust the test suite enough to gate deploys.

### Approach options considered

| # | Approach | Pros | Cons | Recommendation |
|---|----------|------|------|----------------|
| A | Minimal: fix Dockerfile mirror only, add manual deploy doc | Fast; no new secrets to manage | Every deploy is manual; easy to skip checks | Too risky for first production deploy |
| B | GHCR image + SSH deploy workflow + configurable mirror + backup script | Automated, auditable, still self-hosted | Needs SSH key secret and host prep | **Recommended** |
| C | Full GitOps with watchtower + healthcheck rollback | Fully automatic | Adds complexity; rollback still immature in this codebase | Defer to later |

**Selected: B.**

## Design

### 1. Build-time registry mirror configuration

- Remove the hardcoded `RUN npm config set registry https://registry.npmmirror.com` from `docker/Dockerfile`.
- Support an optional `NPM_REGISTRY` build arg that runs `npm config set registry` only when provided.
- Default behavior uses the Node/npm default registry (`https://registry.npmjs.org`).
- Document how users in mainland China pass `--build-arg NPM_REGISTRY=https://registry.npmmirror.com`.

### 2. Production secrets guardrails

- Change `docker-compose.yml` so that `API_KEY_ENCRYPTION_KEY` has **no default** in production.
- Provide `.env.example` with a clear comment that the key must be generated (`openssl rand -hex 32`).
- Keep `docker-compose.yml` usable locally by still allowing `API_KEY_ENCRYPTION_KEY` to be supplied via `.env`; only remove the zero-key fallback.
- Optionally, make the web container fail fast if the key is the zero key in `NODE_ENV=production`.

### 3. GitHub Actions deploy workflow

Add `.github/workflows/deploy.yml`:

- **Trigger:** push to `main`, or manual `workflow_dispatch`, or push of a tag matching `v*`.
- **Jobs:**
  1. **build-and-push**
     - checkout.
     - setup pnpm + Node 22.
     - run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
     - build multi-platform image (`linux/amd64`, `linux/arm64`) and push to `ghcr.io/{owner}/next-wiki-web`.
     - tag: `main` for pushes to main; semver for `v*` tags.
  2. **deploy**
     - needs: build-and-push.
     - SSH to the configured host using repository secrets.
     - run a remote script that:
       - pulls the image,
       - creates/migrates the database,
       - restarts the compose stack,
       - waits for `/healthz`,
       - reports success/failure.
- **Secrets needed:** `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, optional `DEPLOY_SSH_PORT`, `DEPLOY_COMPOSE_DIR`.

### 4. Host-side deploy script

Add `scripts/deploy-remote.sh` (or `scripts/deploy-on-host.sh`) for the on-host step:

- `docker compose pull web`
- `docker compose up -d --no-deps --build web` (or `docker compose up -d`)
- run migrations via a one-off container (`docker compose run --rm web node apps/web/scripts/migrate.mjs`)
- wait for `/healthz`
- keep logs on failure

Make the script idempotent and safe to run manually.

### 5. Backup script

Add `scripts/backup.sh`:

- `pg_dump` the wiki database to a timestamped file.
- `tar` the content volume directory.
- Optional: prune backups older than N days.
- Document cron setup.

### 6. Test stability

- Investigate the 8 timeout failures. Likely fix: increase hook/test timeout for DB-heavy suites or reduce connection pool contention in tests.
- If they are environmental, document how to run tests with adequate resources; if they are real flakes, fix them before deploy workflow gates on tests.

### 7. Documentation

Add `docs/deployment.md` covering:

- prerequisites (Docker, a PostgreSQL-compatible DB, GHCR access, SSH key);
- generating `API_KEY_ENCRYPTION_KEY`;
- configuring `.env` and `docker-compose.yml` for production;
- setting up GitHub secrets;
- restoring from backup;
- updating (image pull + migrate + restart).

## Out of scope for first deploy

- Reverse proxy, TLS, or Cloudflare Tunnel setup (handled externally).
- Watchtower or fully automatic container updates.
- Rollback automation.
- Metrics / alerting stack.
- Multi-node or Kubernetes deployment.
- Object storage (MinIO/S3) backend.

## Success criteria

- `docker compose build` succeeds on a clean machine outside mainland China without registry args.
- `docker compose up -d` fails fast when `API_KEY_ENCRYPTION_KEY` is missing.
- A push to `main` builds, pushes to GHCR, and deploys to the configured host without manual steps.
- `scripts/backup.sh` produces a restorable dump and archive.
- `pnpm test` passes reliably in CI (after timeout fixes).

## Next step

Proceed to write an implementation plan (`writing-plans` skill) covering the files and changes above.
