# Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make next-wiki deployable to a self-hosted production server via GitHub Actions (GHCR image + SSH remote deploy), with an independent production Compose file, configurable registry mirror, production-safe secrets, and a host-side backup script that handles bind volumes.

**Architecture:** Keep the existing local `docker-compose.yml` untouched for development. Add a new `docker-compose.prod.yml` that pulls a published image from GHCR, requires a real `API_KEY_ENCRYPTION_KEY`, and mounts host bind paths for persistence. A GitHub Actions workflow builds/pushes the image on push to `main` or a `v*` tag, then SSHs to the configured host to pull, migrate, and restart. A shell backup script dumps PostgreSQL and archives the bind-mounted content directory.

**Tech Stack:** Docker, Docker Compose, GitHub Actions, GHCR, Bash, pnpm, Next.js 16, PostgreSQL.

## Global Constraints

- Do not assume a reverse proxy, TLS, or DNS inside this project.
- Do not break local development convenience; keep `docker-compose.yml` working for dev.
- Production file: `docker-compose.prod.yml` must require a real `API_KEY_ENCRYPTION_KEY` (no zero-key fallback).
- Registry mirror must be configurable via build arg; default must be public npm registry.
- All host-side paths in `docker-compose.prod.yml` must be overridable via `.env`.
- Backup script must work against bind-mounted host paths, not rely on `docker cp`.
- Follow existing code conventions and file naming in the repo.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `docker/Dockerfile` | Build the web image; supports optional `NPM_REGISTRY` build arg. |
| `docker-compose.yml` | Existing local/dev Compose; keep unchanged except if needed for consistency. |
| `docker-compose.prod.yml` | Production Compose: pulls GHCR image, requires real secrets, bind mounts for persistence. |
| `.env.example` | Document production-required variables and local overrides. |
| `.github/workflows/deploy.yml` | Build multi-platform image, push to GHCR, SSH deploy to host. |
| `scripts/deploy-remote.sh` | On-host script: pull image, run migrations, restart services, healthcheck. |
| `scripts/backup.sh` | Host-side backup: `pg_dump` DB + tar bind-mounted content volume, prune old backups. |
| `docs/deployment.md` | End-to-end deployment guide. |

---

### Task 1: Make Dockerfile registry mirror configurable

**Files:**
- Modify: `docker/Dockerfile:1-5`

**Interfaces:**
- Consumes: build arg `NPM_REGISTRY` (optional).
- Produces: image that installs pnpm; npm registry is configurable but defaults to npmjs.org.

- [ ] **Step 1: Inspect current Dockerfile**

  Read: `docker/Dockerfile:1-5`
  Confirm it contains:
  ```dockerfile
  ARG NODE_IMAGE=node:24-alpine
  FROM ${NODE_IMAGE} AS base
  RUN npm config set registry https://registry.npmmirror.com
  RUN npm install -g pnpm@10.33.0
  WORKDIR /app
  ```

- [ ] **Step 2: Replace hardcoded registry with optional build arg**

  Modify `docker/Dockerfile` so the `base` stage reads an optional `NPM_REGISTRY` build arg and only configures a registry when the arg is non-empty.

  ```dockerfile
  ARG NODE_IMAGE=node:24-alpine
  FROM ${NODE_IMAGE} AS base
  ARG NPM_REGISTRY
  RUN if [ -n "${NPM_REGISTRY}" ]; then npm config set registry "${NPM_REGISTRY}"; fi
  RUN npm install -g pnpm@10.33.0
  WORKDIR /app
  ```

- [ ] **Step 3: Build the image without registry arg to verify default works**

  Run:
  ```bash
  docker build --target base -f docker/Dockerfile -t next-wiki-base:test .
  ```
  Expected: build succeeds (uses npmjs.org).

- [ ] **Step 4: Build the image with registry arg to verify it is applied**

  Run:
  ```bash
  docker build --target base -f docker/Dockerfile --build-arg NPM_REGISTRY=https://registry.npmmirror.com -t next-wiki-base-mirror:test .
  ```
  Expected: build succeeds.

- [ ] **Step 5: Commit**

  ```bash
  git add docker/Dockerfile
  git commit -m "build(docker): make npm registry mirror configurable via NPM_REGISTRY build arg"
  ```

---

### Task 2: Add production Docker Compose file

**Files:**
- Create: `docker-compose.prod.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: env vars `POSTGRES_IMAGE`, `NODE_IMAGE`, `WEB_IMAGE`, `WEB_PORT`, `API_KEY_ENCRYPTION_KEY`, `APP_URL`, `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `CONTENT_LOCAL_HOST_PATH`, `CONTENT_LOCAL_BASE_PATH`, `DATA_DIR`, `NEXT_WIKI_SEED`.
- Produces: a production-ready `docker compose -f docker-compose.prod.yml up -d` deployment.

- [ ] **Step 1: Create `docker-compose.prod.yml`**

  Create `docker-compose.prod.yml` with the following content. It uses a published image (`${WEB_IMAGE}`) instead of building locally, does not expose Postgres on any host interface, and requires `API_KEY_ENCRYPTION_KEY` without a fallback.

  ```yaml
  services:
    db:
      image: ${POSTGRES_IMAGE:-pgvector/pgvector:0.8.3-pg16}
      container_name: next-wiki-db
      environment:
        POSTGRES_USER: ${POSTGRES_USER:-wiki}
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
        POSTGRES_DB: ${POSTGRES_DB:-wiki}
      volumes:
        - ${DATA_DIR:-./data}/postgres:/var/lib/postgresql/data
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-wiki} -d ${POSTGRES_DB:-wiki}"]
        interval: 5s
        timeout: 5s
        retries: 5
      restart: unless-stopped

    web:
      image: ${WEB_IMAGE}
      container_name: next-wiki-web
      environment:
        DATABASE_URL: ${DATABASE_URL:-postgresql://wiki:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-wiki}}
        APP_URL: ${APP_URL}
        NODE_ENV: production
        NEXT_WIKI_SEED: ${NEXT_WIKI_SEED:-false}
        API_KEY_ENCRYPTION_KEY: ${API_KEY_ENCRYPTION_KEY}
        CONTENT_LOCAL_BASE_PATH: ${CONTENT_LOCAL_BASE_PATH:-/data/content}
        TRANSFER_ARTIFACT_BASE_PATH: ${TRANSFER_ARTIFACT_BASE_PATH:-/data/content/transfers}
        TRANSFER_ARTIFACT_RETENTION_HOURS: ${TRANSFER_ARTIFACT_RETENTION_HOURS:-72}
      ports:
        - "${WEB_PORT:-3000}:3000"
      volumes:
        - ${CONTENT_LOCAL_HOST_PATH:-${DATA_DIR:-./data}/content}:${CONTENT_LOCAL_BASE_PATH:-/data/content}
      depends_on:
        db:
          condition: service_healthy
      restart: unless-stopped
  ```

- [ ] **Step 2: Update `.env.example` with production variables**

  Append the following section to `.env.example`:

  ```ini
  # ---------------------------------------------------------------------------
  # Production deployment variables (used by docker-compose.prod.yml)
  # ---------------------------------------------------------------------------

  # Published web image to deploy. The GitHub Actions workflow pushes to:
  #   ghcr.io/<owner>/next-wiki-web:main
  #   ghcr.io/<owner>/next-wiki-web:<semver>  (for v* tags)
  WEB_IMAGE=ghcr.io/hugogu/next-wiki-web:main

  # Required: a 64-character hex encryption key for API keys.
  # Generate with: openssl rand -hex 32
  API_KEY_ENCRYPTION_KEY=

  # Public URL of the deployed instance, e.g. https://wiki.example.com or
  # http://localhost:3000 if you are using a reverse proxy/Tunnel externally.
  APP_URL=https://wiki.example.com

  # Host-side directory that holds Postgres data and content bind mounts.
  DATA_DIR=/var/lib/next-wiki

  # PostgreSQL credentials. POSTGRES_PASSWORD must be set in production.
  POSTGRES_USER=wiki
  POSTGRES_PASSWORD=
  POSTGRES_DB=wiki

  # Optional: override the web container host port.
  WEB_PORT=3000
  ```

- [ ] **Step 3: Validate production compose file syntax**

  Run:
  ```bash
  docker compose -f docker-compose.prod.yml config > /dev/null
  ```
  Expected: no output and exit code 0 (syntax is valid).

- [ ] **Step 4: Commit**

  ```bash
  git add docker-compose.prod.yml .env.example
  git commit -m "deploy: add production docker-compose.prod.yml and example env"
  ```

---

### Task 3: Add host-side deploy script

**Files:**
- Create: `scripts/deploy-remote.sh`

**Interfaces:**
- Consumes: environment variables `COMPOSE_FILE`, `WEB_IMAGE`, `APP_URL`, `WEB_PORT`, optional `HEALTHCHECK_TIMEOUT_SECONDS`.
- Produces: updated running containers and a health-check result.

- [ ] **Step 1: Create `scripts/deploy-remote.sh`**

  ```bash
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
  ```

- [ ] **Step 2: Make the script executable**

  Run:
  ```bash
  chmod +x scripts/deploy-remote.sh
  ```

- [ ] **Step 3: Shell-check the script**

  Run:
  ```bash
  bash -n scripts/deploy-remote.sh
  ```
  Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/deploy-remote.sh
  git commit -m "deploy: add remote host deploy script with migration and healthcheck"
  ```

---

### Task 4: Add host-side backup script

**Files:**
- Create: `scripts/backup.sh`

**Interfaces:**
- Consumes: env vars `BACKUP_DIR`, `DATA_DIR`, `POSTGRES_USER`, `POSTGRES_DB`, `BACKUP_RETENTION_DAYS`.
- Produces: timestamped `wiki-YYYYMMDD-HHMMSS.sql.gz` and `content-YYYYMMDD-HHMMSS.tar.gz` files in `BACKUP_DIR`.

- [ ] **Step 1: Create `scripts/backup.sh`**

  ```bash
  #!/usr/bin/env bash
  # Backup next-wiki PostgreSQL data and content bind volume.
  # Designed to run on the host where docker-compose.prod.yml volumes live.
  set -euo pipefail

  BACKUP_DIR="${BACKUP_DIR:-./backups}"
  DATA_DIR="${DATA_DIR:-./data}"
  POSTGRES_USER="${POSTGRES_USER:-wiki}"
  POSTGRES_DB="${POSTGRES_DB:-wiki}"
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  mkdir -p "${BACKUP_DIR}"

  DB_BACKUP="${BACKUP_DIR}/wiki-${TIMESTAMP}.sql.gz"
  CONTENT_BACKUP="${BACKUP_DIR}/content-${TIMESTAMP}.tar.gz"

  echo "== Backing up database to ${DB_BACKUP} =="
  docker exec next-wiki-db pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${DB_BACKUP}"

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
  ```

- [ ] **Step 2: Make the script executable**

  Run:
  ```bash
  chmod +x scripts/backup.sh
  ```

- [ ] **Step 3: Shell-check the script**

  Run:
  ```bash
  bash -n scripts/backup.sh
  ```
  Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

  ```bash
  git add scripts/backup.sh
  git commit -m "deploy: add host-side backup script for database and content bind volume"
  ```

---

### Task 5: Add GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: repository secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, optional `DEPLOY_SSH_PORT` / `DEPLOY_COMPOSE_DIR` / `DEPLOY_WEB_PORT` / `DEPLOY_APP_URL`.
- Produces: GHCR image pushed and remote host updated.

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

  ```yaml
  name: Build and Deploy

  on:
    push:
      branches: [main]
      tags: ['v*']
    workflow_dispatch:

  concurrency:
    group: deploy-${{ github.ref }}
    cancel-in-progress: true

  env:
    REGISTRY: ghcr.io
    IMAGE_NAME: ${{ github.repository }}-web

  jobs:
    build-and-push:
      runs-on: ubuntu-latest
      permissions:
        contents: read
        packages: write
        attestations: write
        id-token: write
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Set up QEMU
          uses: docker/setup-qemu-action@v3

        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3

        - name: Log in to GHCR
          uses: docker/login-action@v3
          with:
            registry: ${{ env.REGISTRY }}
            username: ${{ github.actor }}
            password: ${{ secrets.GITHUB_TOKEN }}

        - name: Extract metadata
          id: meta
          uses: docker/metadata-action@v5
          with:
            images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
            tags: |
              type=ref,event=branch
              type=semver,pattern={{version}}
              type=semver,pattern={{major}}.{{minor}}

        - name: Build and push image
          uses: docker/build-push-action@v6
          with:
            context: .
            file: docker/Dockerfile
            target: runner
            platforms: linux/amd64,linux/arm64
            push: true
            tags: ${{ steps.meta.outputs.tags }}
            labels: ${{ steps.meta.outputs.labels }}
            cache-from: type=gha
            cache-to: type=gha,mode=max

    deploy:
      needs: build-and-push
      runs-on: ubuntu-latest
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Deploy to host via SSH
          env:
            DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
            DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
            DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
            DEPLOY_SSH_PORT: ${{ secrets.DEPLOY_SSH_PORT || '22' }}
            DEPLOY_COMPOSE_DIR: ${{ secrets.DEPLOY_COMPOSE_DIR || '/opt/next-wiki' }}
            DEPLOY_APP_URL: ${{ secrets.DEPLOY_APP_URL || 'http://localhost:3000' }}
            WEB_IMAGE: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.ref_name == 'main' && 'main' || github.ref_name }}
          run: |
            install -m 600 /dev/null "${RUNNER_TEMP}/deploy_key"
            printf '%s\n' "${DEPLOY_SSH_KEY}" > "${RUNNER_TEMP}/deploy_key"
            ssh -i "${RUNNER_TEMP}/deploy_key" \
                -o StrictHostKeyChecking=no \
                -o UserKnownHostsFile=/dev/null \
                -p "${DEPLOY_SSH_PORT}" \
                "${DEPLOY_USER}@${DEPLOY_HOST}" \
                "cd ${DEPLOY_COMPOSE_DIR} && WEB_IMAGE='${WEB_IMAGE}' APP_URL='${DEPLOY_APP_URL}' ./scripts/deploy-remote.sh"
  ```

- [ ] **Step 2: Validate workflow YAML syntax**

  Run:
  ```bash
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"
  ```
  Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

  ```bash
  git add .github/workflows/deploy.yml
  git commit -m "ci: add build-and-deploy workflow for GHCR image and SSH remote deploy"
  ```

---

### Task 6: Write deployment documentation

**Files:**
- Create: `docs/deployment.md`

**Interfaces:**
- Consumes: all previous artifacts.
- Produces: human-readable deployment guide.

- [ ] **Step 1: Create `docs/deployment.md`**

  ```markdown
  # Deploying next-wiki to production

  This guide covers a self-hosted Docker deployment driven by GitHub Actions.
  It assumes you have an existing reverse proxy / TLS / tunnel layer (e.g.
  Cloudflare Tunnel, Nginx, Caddy) outside of this project.

  ## What the deploy pipeline does

  1. On every push to `main` or a `v*` tag, GitHub Actions builds a
     multi-platform image and pushes it to `ghcr.io/<owner>/next-wiki-web`.
  2. The workflow then SSHs into your server and runs
     `scripts/deploy-remote.sh`, which pulls the image, migrates the database,
     and restarts the containers.

  ## Prepare the server

  1. Install Docker Engine and Docker Compose.
  2. Create a directory for the deployment, e.g. `/opt/next-wiki`.
  3. Clone the repository there (or at least place `docker-compose.prod.yml`,
     `.env`, and `scripts/deploy-remote.sh`).
  4. Generate secrets:

     ```bash
     openssl rand -hex 32   # API_KEY_ENCRYPTION_KEY
     openssl rand -hex 16   # POSTGRES_PASSWORD (or use any strong password)
     ```

  5. Copy `.env.example` to `.env` and fill in at least:

     ```ini
     WEB_IMAGE=ghcr.io/<your-github-username>/next-wiki-web:main
     API_KEY_ENCRYPTION_KEY=<64-char-hex>
     POSTGRES_PASSWORD=<strong-password>
     APP_URL=https://wiki.example.com
     DATA_DIR=/opt/next-wiki/data
     WEB_PORT=3000
     ```

  6. Create the data directory:

     ```bash
     mkdir -p /opt/next-wiki/data/postgres /opt/next-wiki/data/content
     ```

  7. Ensure the server user that runs the deploy can read `.env` and write to
     `DATA_DIR` and the Docker socket.

  ## Configure GitHub secrets

  In the repository on GitHub, add these secrets under **Settings > Secrets and variables > Actions**:

  | Secret | Example | Purpose |
  |--------|---------|---------|
  | `DEPLOY_HOST` | `203.0.113.10` or `wiki.example.com` | SSH target |
  | `DEPLOY_USER` | `deploy` | SSH user |
  | `DEPLOY_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private key for the user |
  | `DEPLOY_SSH_PORT` | `22` | Optional SSH port |
  | `DEPLOY_COMPOSE_DIR` | `/opt/next-wiki` | Directory on the host |
  | `DEPLOY_APP_URL` | `http://localhost:3000` | URL used for healthcheck |

  The public key must be in `~/.ssh/authorized_keys` of `DEPLOY_USER` on the server.

  ## First deploy

  Push to `main` or trigger the workflow manually from the Actions tab. Then
  on the server:

  ```bash
  docker compose -f docker-compose.prod.yml logs -f web
  ```

  Once healthy, open `APP_URL/setup` in a browser to create the first admin.

  ## Backup

  Run `scripts/backup.sh` manually or from cron:

  ```bash
  BACKUP_DIR=/opt/next-wiki/backups DATA_DIR=/opt/next-wiki/data ./scripts/backup.sh
  ```

  It produces `wiki-YYYYMMDD-HHMMSS.sql.gz` and `content-YYYYMMDD-HHMMSS.tar.gz`.
  Backups older than `BACKUP_RETENTION_DAYS` (default 14) are pruned.

  ## Restore

  1. Stop the web container.
  2. Restore PostgreSQL:

     ```bash
     zcat wiki-YYYYMMDD-HHMMSS.sql.gz | docker exec -i next-wiki-db psql -U wiki -d wiki
     ```

  3. Restore content:

     ```bash
     tar -xzf content-YYYYMMDD-HHMMSS.tar.gz -C /opt/next-wiki/data
     ```

  4. Start the web container.

  ## Updating

  Pushing to `main` automatically deploys the new image. For a more explicit
  release, push a semver tag like `v0.1.0` and the workflow will deploy
  `ghcr.io/<owner>/next-wiki-web:v0.1.0`.

  ## Mainland China / registry mirrors

  If your build host has poor connectivity to npmjs.org, pass a registry mirror:

  ```bash
  docker build -f docker/Dockerfile --build-arg NPM_REGISTRY=https://registry.npmmirror.com .
  ```

  For GitHub Actions runners outside mainland China the default registry is
  usually fine.
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/deployment.md
  git commit -m "docs: add production deployment guide"
  ```

---

## Spec Coverage Self-Review

| Spec Requirement | Implementing Task |
|------------------|-------------------|
| Dockerfile registry mirror configurable | Task 1 |
| Independent production Compose file | Task 2 |
| Production requires real API key | Task 2 |
| GHCR image build/push | Task 5 |
| SSH remote deploy | Task 5 |
| On-host migration + healthcheck | Task 3 |
| Bind-volume-aware backup | Task 4 |
| Deployment documentation | Task 6 |

## Placeholder Scan

- No TBD/TODO placeholders.
- All file paths are exact.
- All code blocks contain real content.
- All commands include expected outcome.

## Type / Naming Consistency

- Env var names match between `.env.example`, `docker-compose.prod.yml`, `scripts/deploy-remote.sh`, `scripts/backup.sh`, and `docs/deployment.md`.
- Service/container names match existing conventions (`next-wiki-db`, `next-wiki-web`).
- Image name `${github.repository}-web` matches the existing project naming.
