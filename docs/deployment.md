# Deploying next-wiki to production

This guide covers a self-hosted Docker deployment driven by GitHub Actions.
It assumes you have an existing reverse proxy / TLS / tunnel layer (e.g.
Cloudflare Tunnel, Nginx, Caddy) outside of this project.

## What the deploy pipeline does

1. On every push to `main` or a `v*` tag, GitHub Actions builds a
   multi-platform image and pushes it to `ghcr.io/<owner>/next-wiki-web`.
   On `v*` tags a separate workflow also publishes the release to Docker Hub
   as `hugogu/next-wiki-web:<semver>` and `hugogu/next-wiki-web:latest` — the
   latter is what `docker-compose.prod.yml` pulls by default.
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
   API_KEY_ENCRYPTION_KEY=<64-char-hex>
   POSTGRES_PASSWORD=<strong-password>
   APP_URL=https://wiki.example.com
   DATA_DIR=/opt/next-wiki/data
   WEB_PORT=3000
   # Optional: defaults to hugogu/next-wiki-web:latest on Docker Hub.
   # Override to pin a tag or use your own registry (e.g. GHCR).
   # WEB_IMAGE=hugogu/next-wiki-web:latest
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

Agent Memory records are restricted Raw content backed by the shared page/revision
content store and are included in both backups. Explicit records use one Raw
entry; continuing conversation evidence appends immutable revisions to its Raw
conversation page. See the
[Hermes memory provider](../packages/hermes-memory-provider/README.md) guide
before connecting a remote client, especially for TLS and container-network
requirements.

For OpenClaw Memory Wiki synchronization, install the native
[`@next-wiki/openclaw-memory-wiki`](../packages/openclaw-memory-wiki/README.md)
plugin and configure the single SecretRef from a normal Memory provider API
key. Set the key's agent identity to `openclaw` and grant only the scopes and
spaces required by the installation. The plugin writes through the same
restricted Raw/page/revision storage and leaves local vault files and older
revisions intact; use HTTPS for non-loopback deployments.

### Restore

1. Stop the web container:

   ```bash
   docker compose -f docker-compose.prod.yml stop web
   ```

2. Restore PostgreSQL:

   ```bash
   zcat wiki-YYYYMMDD-HHMMSS.sql.gz | docker exec -i next-wiki-db psql -U wiki -d wiki
   ```

3. Restore content:

   ```bash
   tar -xzf content-YYYYMMDD-HHMMSS.tar.gz -C /opt/next-wiki/data
   ```

4. Start the web container:

   ```bash
   docker compose -f docker-compose.prod.yml start web
   ```

## Public read-only demo

A demo instance is just another production deployment (see
[Prepare the server](#prepare-the-server) and [First deploy](#first-deploy)
above): it runs the same published `docker-compose.prod.yml` image from
Docker Hub/GHCR, not a local build. No separate pipeline or image is needed.

Follow the normal production setup and complete `/setup` once to create the
admin account and, optionally, generate example pages (or restore a snapshot
instead). Then in that deployment's `.env`:

```ini
NEXT_WIKI_DEMO_READONLY=true
```

```bash
docker compose -f docker-compose.prod.yml pull web
docker compose -f docker-compose.prod.yml up -d
```

`NEXT_WIKI_DEMO_READONLY=true` blocks every write action — page
create/edit/publish/delete, attachments, and admin settings — for every
actor, including admins, while reads and AI Q&A/search stay live. It only
seeds the setting's initial value the very first time the app boots against
a fresh database; the persisted value in `site_settings` is the sole source
of truth after that. An admin can flip it on/off at runtime from
**Admin → Site** — no restart or redeploy needed — and that toggle itself is
never blocked by the mode it controls, so turning it back off never requires
a database edit. Page responses do not set `X-Frame-Options`/`frame-ancestors`
by default (some asset routes send their own unrelated
`Content-Security-Policy`, but that header does not restrict embedding
pages), so the app can already be embedded in an `<iframe>` from another
origin; scope that down with a reverse-proxy header if the demo should only
be embeddable from a specific origin.

## Updating

Pushing to `main` automatically deploys the new image. For a more explicit
release, push a semver tag like `v0.1.0`: the workflow deploys
`ghcr.io/<owner>/next-wiki-web:v0.1.0` and also publishes
`hugogu/next-wiki-web:v0.1.0` (plus `:latest`) to Docker Hub. To deploy the
Docker Hub image manually, set `WEB_IMAGE=hugogu/next-wiki-web:latest` (or a
pinned tag) in `.env` and run `scripts/deploy-remote.sh`.

### One-time upgrade: squashed Drizzle history

The release containing the squashed `0000_init` migration requires a one-time
history reset. It does not execute the init migration's application-schema DDL
and does not change application tables or their data.

1. Back up the database with `scripts/backup.sh`.
2. Upgrade to the final pre-squash release and let its normal migration step
   complete. Verify that all 44 legacy Drizzle migrations, through `0043`, are
   recorded.
3. Deploy the squashed release normally. Its migration command atomically
   verifies that exact legacy history, replaces only
   `drizzle.__drizzle_migrations` with the new `0000_init` record, then runs
   Drizzle normally. The new init is already recorded, so none of its `CREATE`,
   `ALTER`, or data statements are executed against the existing database.

If the command reports an unrecognized migration history, do not force the
upgrade. Restore or finish the pre-squash migration chain first, then rerun
the deployment. Fresh installations need no special step: they run the new
`0000_init` normally.

## Local development

Local development still uses the original `docker-compose.yml`. Every
variable it reads has an inline default, so no `.env` file is required to
get started — copy `.env.example` only if you want to change a port or
supply an API key:

```bash
cp .env.example .env   # optional — keep defaults or adjust ports as needed
docker compose up -d --build
```

For a one-command version of the same thing — build, wait for the health
check, and open a browser — run:

```bash
pnpm quickstart
```

This wraps the same `docker compose up -d --build` above; it does not
change how the stack is deployed, it only adds progress feedback and
auto-opens `http://localhost:3000` (or `/setup` on first run) once the web
container reports healthy. Stop the stack the normal way: `docker compose
down`.

## Static site publishing dependencies

The optional static site publishing feature adds one binary to the runtime
image: `pagefind_extended`, which builds the published site's search index. It
is pinned by version, verified against its published checksum at build time, and
executed only while a publish is running — a deployment that never publishes a
static site never runs it, and it adds no service, no port, and no setup step.

Two build arguments control it:

| Argument | Default | Purpose |
|---|---|---|
| `PAGEFIND_VERSION` | `1.5.2` | Pinned release. Do not downgrade below 1.5.1 — earlier musl builds have a known indexing throughput regression. |
| `PAGEFIND_BASE_URL` | GitHub releases | Point at an internal mirror where GitHub is unreachable. |

The site's stylesheet and client runtime are produced at image build time by
`pnpm --filter @next-wiki/web build:static-site-assets` (Tailwind CLI plus
esbuild). Both are build-time only and add nothing to the running container
beyond the static files themselves. The output lands in
`apps/web/public/static-site/` and is copied into the runtime image with the
rest of that directory.

If a publish fails with *"Static site assets are missing"*, the image was built
before this step existed. Rebuild it:

```bash
docker compose build --no-cache web
```

The assets are located relative to the app's working directory. Set
`STATIC_SITE_ASSETS_DIR` if your deployment runs the process from somewhere
else.

## Mainland China / registry mirrors

If your build host has poor connectivity to npmjs.org, pass a registry mirror:

```bash
docker build -f docker/Dockerfile --build-arg NPM_REGISTRY=https://registry.npmmirror.com .
```

For GitHub Actions runners outside mainland China the default registry is
usually fine. The Pagefind download has the same consideration — use
`PAGEFIND_BASE_URL` to point at a reachable mirror:

```bash
docker build -f docker/Dockerfile \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg PAGEFIND_BASE_URL=https://your-mirror.example/pagefind .
```
