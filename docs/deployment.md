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

## Updating

Pushing to `main` automatically deploys the new image. For a more explicit
release, push a semver tag like `v0.1.0`: the workflow deploys
`ghcr.io/<owner>/next-wiki-web:v0.1.0` and also publishes
`hugogu/next-wiki-web:v0.1.0` (plus `:latest`) to Docker Hub. To deploy the
Docker Hub image manually, set `WEB_IMAGE=hugogu/next-wiki-web:latest` (or a
pinned tag) in `.env` and run `scripts/deploy-remote.sh`.

## Local development

Local development still uses the original `docker-compose.yml`:

```bash
cp .env.example .env   # keep defaults or adjust ports as needed
docker compose up -d --build
```

## Mainland China / registry mirrors

If your build host has poor connectivity to npmjs.org, pass a registry mirror:

```bash
docker build -f docker/Dockerfile --build-arg NPM_REGISTRY=https://registry.npmmirror.com .
```

For GitHub Actions runners outside mainland China the default registry is
usually fine.
