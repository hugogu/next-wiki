# Quickstart: Public Wiki Content API

This feature makes wiki content automation possible through the stable
`/api/v1` contract.

## Prerequisites

- Start the full app using the repository Compose workflow:

```bash
docker compose up -d --build
```

- Sign in as Admin and create:
  - a Reader user and API key with `view`;
  - an Editor user and API key with `view`, `create`, and `edit`;
  - optionally an Admin key for administrative smoke tests.

## Read Workflow

```bash
curl -fsS \
  -H "Authorization: Bearer $READER_KEY" \
  "http://127.0.0.1:3000/api/v1/pages?limit=20"
```

Expected:

- Only pages readable by the Reader are returned.
- Draft-only pages from other users are absent.
- Each item has stable page and revision identity.

Read a page by path:

```bash
curl -fsS \
  -H "Authorization: Bearer $READER_KEY" \
  "http://127.0.0.1:3000/api/v1/pages/by-path/welcome"
```

## Create, Draft, Publish

Create a page:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path":"api-demo/page","title":"API Demo","contentSource":"# API Demo\nInitial content"}' \
  "http://127.0.0.1:3000/api/v1/pages"
```

Create a new draft after reading the latest revision id:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"API Demo","contentSource":"# API Demo\nUpdated content","baseRevisionId":"'$BASE_REVISION_ID'"}' \
  "http://127.0.0.1:3000/api/v1/pages/$PAGE_ID/drafts"
```

Publish the draft:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"expectedRevisionId":"'$REVISION_ID'"}' \
  "http://127.0.0.1:3000/api/v1/pages/$PAGE_ID/revisions/$VERSION/publication"
```

Expected:

- Reader cannot see draft content before publication.
- Reader sees the published update after publication.
- History lists both revisions where visible.

## Upload Asset

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $EDITOR_KEY" \
  -F "file=@./pixel.png" \
  "http://127.0.0.1:3000/api/v1/assets"
```

Expected:

- Response includes `id`, `url`, and `markdown`.
- The Markdown reference can be inserted into a draft and becomes readable when
  the owning page/revision is visible.

## Search

```bash
curl -fsS \
  -H "Authorization: Bearer $READER_KEY" \
  "http://127.0.0.1:3000/api/v1/search/pages?q=API%20Demo"
```

Expected:

- Results include only readable pages.
- Draft and protected matches are absent for unauthorized keys.

## Permission Checks

- Reader key:
  - `GET /api/v1/pages` succeeds.
  - `POST /api/v1/pages` returns `403`.
  - `POST /api/v1/assets` returns `403`.
- Editor key:
  - create, draft, publish, and asset upload succeed for permitted pages.
- Key with `create` but Reader role:
  - create is denied because scope and role must both allow the action.

## Stale Update Drill

1. Read a page and store `latestRevision.id`.
2. Create a draft from another session or key.
3. Try to create a draft with the old `baseRevisionId`.

Expected: `409 STALE_REVISION` and no new revision is created.

## Audit and Documentation

Verify generated API documentation:

```bash
curl -fsS http://127.0.0.1:3000/api/openapi.json | rg '"/api/v1/pages"'
```

Open `/api-docs` and confirm Public Wiki Content API resources are present.

The generated OpenAPI paths are exposed without the Next.js `/api` prefix, so
the public page list appears as `/v1/pages` in the OpenAPI document.

Review audit history:

- key owner sees their API-key calls in user audit;
- Admin sees all public content API calls in admin audit;
- audit rows do not contain full Markdown source or file bytes.

## Regression

Run the normal verification set after implementation:

```bash
pnpm --filter @next-wiki/shared typecheck
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web test:e2e
```

Then verify the Compose deployment:

```bash
docker compose up -d --build
docker compose ps
```
