# Quickstart: Content Storage Backends & Images

**Feature**: 003-content-storage-backends

This feature is **zero-config by default**: a fresh deployment stores all content
(Markdown + images) in PostgreSQL. The steps below are only needed to exercise the
optional backends.

## Default (Database) — nothing to do

```bash
docker compose up
```

- Active backend = **Database**. PostgreSQL is the only stateful service (P1).
- Upload images in the editor (toolbar button or paste); they are stored in
  `content_blobs` and served via `/api/assets/{id}`.

## Local development

```bash
pnpm install            # pulls pg-boss; @aws-sdk/client-s3 + isomorphic-git are optional-but-bundled
pnpm --filter web db:migrate
pnpm --filter web dev
```

The pg-boss worker starts in-process with the web server (migration + git-export
jobs). pg-boss creates its own schema in the existing database on first run.

## Try the in-editor image flow

1. Open any page in edit mode.
2. Click the image toolbar button **or** paste/drag an image into the editor.
3. The image uploads, `![](/api/assets/{id})` is inserted, and it renders in the
   live preview and on the published page.

## Switch the active backend (admin)

1. Sign in as an admin → **Admin → Content Storage** (`/admin/storage`).
2. Configure a target backend (Local or S3), then click **Test connection**.
3. Click **Switch backend** → a migration starts (copy → verify → cutover) with a
   **brief read-only window** (reads stay up; saves/uploads pause).
4. Watch progress; on success the new backend becomes active. On failure the
   original stays active with no data loss. The old backend's data is retained
   until you explicitly clean it up.

### Local backend (Docker)

Add a writable mount for the base path, e.g. in `docker-compose.override.yml`:

```yaml
services:
  web:
    volumes:
      - ./.content-store:/data/content
```

Set the Local backend `basePath` to `/data/content` in the admin form.

### S3 / MinIO backend (integration testing)

Run a MinIO container (compose integration profile) and configure the S3 backend
with `endpoint`, `region`, `bucket`, `accessKeyId` (config) + secret key (stored
encrypted). Works with AWS S3 or any S3-compatible store.

## Enable Git one-way export (optional)

1. **Admin → Content Storage → Git export**: set remote URL, branch, and a token
   (stored encrypted), then enable.
2. On each publish, a background job pushes standard Markdown + assets to the
   repo (e.g. to feed GitHub Pages). Export failures are retried and never block
   editing; content is never read back from Git.

## API key scopes

Create keys with the new scopes (User Center → API Keys):

- `storage` (存储控制): read/change storage config and run migrations — effective
  only for admins (scope ∩ role).
- `preferences` (偏好管理): read/change your own display preferences (theme,
  language).

## Verification checklist

- `pnpm --filter web test` — unit + integration (ContentStore conformance,
  permissions, migration state machine).
- `pnpm --filter web test:e2e` — Playwright: image upload/render, admin storage
  switch with read-only window, scope enforcement.
- `docker compose up --build` — confirm default DB-only deployment still boots and
  serves images.
