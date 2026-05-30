# next-wiki Docker Operator Guide

## Quick Start

### Prerequisites

- Docker Desktop 4.x+ (or Docker Engine 24+ with Docker Compose plugin)
- At least 1 GB free disk space for PostgreSQL data

### 1. Clone and configure

```bash
git clone https://github.com/your-org/next-wiki.git
cd next-wiki

# Copy the sample environment file
cp .env.example .env
```

Edit `.env` and set the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL password |
| `BETTER_AUTH_SECRET` | ✅ | Min 32-character secret for session signing. Generate: `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | ✅ | 64-character hex key for encrypting stored credentials. Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public URL of your wiki (e.g. `https://wiki.example.com`) |
| `LLM_PROVIDER` | ❌ | Optional: `openai`, `anthropic`, `ollama`, or compatible |
| `LLM_API_KEY` | ❌ | API key for the chosen LLM provider |

### 2. Start

```bash
docker compose up -d
```

First start pulls images, creates volumes, and starts PostgreSQL and the app.
The app waits for PostgreSQL to be healthy before starting.

### 3. Complete first-run setup

Visit `http://localhost:3000/setup` (or your configured `NEXT_PUBLIC_APP_URL`).
Fill in the administrator email, password, and display name.

After setup completes, you can sign in at `/login`.

### 4. Verify health

```bash
# Liveness
curl http://localhost:3000/healthz

# Readiness (includes DB connectivity)
curl http://localhost:3000/readyz
```

Both should return `{"status":"ok"/"ready"}`.

---

## Persistent Data

next-wiki uses two named Docker volumes:

| Volume | Contents |
|--------|----------|
| `next-wiki_db_data` | PostgreSQL database (all wiki content, users, settings) |
| `next-wiki_assets_data` | Uploaded files and diagram artifacts |

**These volumes survive `docker compose down`** unless you explicitly remove them with `-v`.

---

## Upgrading

```bash
# 1. Pull new images
docker compose pull

# 2. Restart services
docker compose up -d

# 3. Migrations run automatically on startup
```

Schema migrations are idempotent. Running them more than once is safe.

---

## Logs

```bash
# All services
docker compose logs -f

# App only
docker compose logs -f web

# PostgreSQL only
docker compose logs -f db
```

---

## Stopping

```bash
# Stop containers (data preserved)
docker compose down

# Stop and remove all data (DESTRUCTIVE)
docker compose down -v
```

---

## Configuration Reference

All configuration is via environment variables in `.env`. Sensitive values set through
the admin interface (AI credentials, LDAP passwords, OAuth secrets) are encrypted at
rest using `ENCRYPTION_KEY`. **Never lose this key** — encrypted credentials cannot
be recovered without it.

See `.env.example` for the full variable list with descriptions.
