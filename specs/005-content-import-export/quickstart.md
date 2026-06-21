# Quickstart: Content Import and Export

## Prerequisites

```bash
docker compose up -d --build
docker compose ps
curl -sf http://127.0.0.1:3000/readyz
```

Use an administrator account. For Wiki.js tests, prepare a Wiki.js 2.2+ fixture
whose API token can read pages, source, and assets.

## Static Verification

```bash
pnpm typecheck
pnpm lint
pnpm --filter @next-wiki/web openapi:generate
git diff --check
```

## Automated Tests

```bash
export TEST_DATABASE_URL=postgresql://wiki:wiki@127.0.0.1:15433/wiki_test
pnpm test
pnpm --filter @next-wiki/web test:e2e
```

Required focused suites:

- archive manifest/frontmatter round trip;
- deterministic export ordering and shared-asset deduplication;
- lazy ZIP limits, checksum mismatch, duplicate path, path traversal, symlink,
  zip bomb, truncation, and undeclared entry;
- streamed upload limit/atomic finalize/interrupted retry;
- source credentials encryption/redaction;
- Wiki.js inventory/source GraphQL fixtures and permission errors;
- Markdown identity and HTML conversion;
- remote-image redirects, DNS rebinding simulation, private-range policy,
  cross-origin token stripping, media validation, and deduplication;
- create/replace/skip, revision preservation, item atomicity, resume, retry,
  cancellation, and active-run exclusion;
- admin-only routes and artifact downloads;
- retention cleanup and missing-file convergence.

## Portable Archive Scenario

1. Create:
   - nested published pages in two locales;
   - one draft-only page and one deleted page;
   - two pages referencing the same image;
   - internal links and an external image URL.
2. Open `/admin/transfers?tab=exports`.
3. Start an export and verify the route returns immediately with a queued run.
4. Refresh and deep-link to `/admin/transfers/{runId}`; progress must persist.
5. Download the completed ZIP.
6. Inspect:

```bash
unzip -l export.zip
unzip -p export.zip manifest.json | jq .
```

Expected:

- published pages only;
- original Markdown and frontmatter;
- shared local image once;
- file counts and checksums match;
- draft/deleted pages and system/user data absent.

## Archive Restore Scenario

1. On a clean target, reserve an upload artifact and stream the ZIP.
2. Start `archive_preview` with default `skip` conflicts.
3. Verify the preview totals and item actions.
4. Start `archive_import` from the completed preview.
5. Verify every imported page and local image.
6. Re-run the same import: no duplicate pages/assets.
7. Edit a target page, preview with `replace`, import, and verify:
   - a new published revision is created;
   - the previous target revision remains in history.

## Wiki.js Scenario

1. Configure the Wiki.js base URL and API token.
2. Run the source test; inspect sanitized failure detail for a bad token.
3. Preview a source with Markdown, CKEditor HTML, nested paths, locales, tags,
   shared images, one inaccessible image, and one unsupported content type.
4. Verify:
   - Markdown items are preserved;
   - HTML items are marked converted;
   - unsupported items are skipped with a reason;
   - same-origin images use authenticated fetch;
   - cross-origin images do not receive the Wiki.js token.
5. Import and disconnect the source site.
6. Load every imported page; localized images must still render.

## Failure Drills

### Unsafe archive

Create fixtures with `../`, absolute paths, duplicate normalized names, symlink
entries, a forged size, and excessive compression. Each preview must fail before
any page/asset mutation.

### Interrupted import

Stop the web container during a large import:

```bash
docker compose stop web
docker compose start web
```

Expected: the interrupted run is recoverable or marked retryable; a retry
processes only incomplete items and creates no duplicates.

### Storage exhaustion

Constrain the artifact directory and upload/export past the limit. Expected:
artifact/run fails with a bounded error; `.partial` files are cleaned; wiki
content remains usable.

### SSRF

Test loopback, link-local, private, IPv4-mapped IPv6, hostname-to-private,
redirect-to-private, and DNS-change fixtures. They must be rejected unless the
configured Wiki.js host has explicit private-network trust; that trust must not
extend to arbitrary cross-origin images.

### Concurrency

Start one import, then attempt another import and a content-storage migration.
Only one content mutation may proceed. Read-only export/preview may run from
captured snapshots.

## Docker and Operations Validation

```bash
docker compose up -d --build
docker compose logs --tail=300 web
docker compose exec -T db psql -U wiki -d wiki -c \
  "select kind,status,phase,total_items,processed_items,failed_items from transfer_runs order by queued_at desc limit 10;"
find .content-data/transfers -maxdepth 2 -type f -ls
```

Verify:

- migration applies idempotently;
- pg-boss transfer handlers and cleanup schedule register;
- artifact path is writable and persistent across restart;
- logs contain ids/counters, not API tokens or page bodies;
- expired artifacts are removed while run reports remain queryable.

## OpenAPI Verification

```bash
pnpm --filter @next-wiki/web openapi:generate
rg -n 'transfer-sources|transfer-artifacts|/transfers' apps/web/public/openapi.json
git diff -- apps/web/public/openapi.json
```
