# Quickstart: System-Level AI Support

**Feature**: 004-system-ai-support

This document defines the expected implementation and verification workflow.
Commands become executable as the feature tasks land.

## Prerequisites

- Docker with Compose support
- pnpm 10
- Node.js 20.9+ for host-side tooling
- No paid AI provider is required for automated tests

## Environment

Existing required settings remain:

```dotenv
DATABASE_URL=postgresql://wiki:wiki@db:5432/wiki
API_KEY_ENCRYPTION_KEY=<64 hex characters>
```

AI provider credentials are configured through the Admin UI and encrypted with
the deployment key. No default provider or credential is required.

Optional operational limits should have safe defaults:

```dotenv
AI_PROVIDER_CONNECT_TIMEOUT_MS=5000
AI_PROVIDER_REQUEST_TIMEOUT_MS=60000
AI_PROVIDER_TOOL_PLANNER_TIMEOUT_MS=120000
AI_EVENT_RETENTION_HOURS=24
AI_ARTIFACT_RETENTION_HOURS=24
AI_MAX_GENERATED_IMAGE_BYTES=10485760
```

## Start the complete test deployment

Per repository instructions, bring up the database and application through
Compose:

```bash
docker compose up -d --build
docker compose ps
```

The database service must use a pgvector-enabled PostgreSQL 16 image. Verify:

```bash
docker compose exec db psql -U wiki -d wiki -c \
  "select extversion from pg_extension where extname = 'vector';"
```

Expected: one `vector` extension row.

If a local `.env` already sets `POSTGRES_IMAGE`, that value overrides the
Compose default. Update or remove stale overrides that still reference plain
`postgres:16-*`, then recreate the database container:

```bash
docker compose pull db
docker compose up -d --force-recreate db web
```

## Configure a provider

1. Sign in as Admin.
2. Open `/admin/ai/providers`.
3. Add either:
   - an OpenRouter provider; or
   - an OpenAI-compatible fixture/local provider.
4. Run the connection test.
5. Start model synchronization.
6. Review capability provenance; manually fill any unknown capabilities.
7. Assign compatible models under `/admin/ai`.

Automated tests must use a local deterministic fixture provider, not a real
credential.

## Build the knowledge index

1. Assign an embedding-capable model with known dimensions.
2. Open `/admin/ai/indexes`.
3. Start a rebuild.
4. Confirm pending/running/completed counters update asynchronously.
5. Publish or republish a page during the rebuild.
6. Confirm activation occurs only after the catch-up pass includes that latest
   revision.

## Grant user access

1. Open `/admin/users/{userId}/ai`.
2. Enable the desired switches.
3. Verify a Reader may use Q&A when enabled but cannot optimize or insert images.
4. Verify an Editor/Admin needs both the entitlement and normal page edit
   permission for editor AI actions.

## Verify semantic search

1. Publish pages with related concepts but different wording.
2. Open `/search?q=<concept>&mode=semantic`.
3. Confirm relevant permitted pages rank first.
4. Confirm an unreadable/deleted/unpublished page never appears.
5. Change the embedding assignment and rebuild.
6. Confirm search continues using the old ready generation until atomic
   activation of the new one.

## Verify Wiki Q&A

1. Open a reader page with `?ai=open&aiMode=retrieval`.
2. Ask a question with a known Wiki answer.
3. Confirm response deltas arrive through SSE.
4. Confirm every citation opens a readable page/revision.
5. Remove access while an action is running and confirm no protected citation or
   excerpt is returned.
6. Test full-context mode with a small corpus.
7. Lower the configured context capacity and confirm the request fails before
   provider invocation with a retrieval-mode suggestion.

## Verify editor actions

### Text optimization

1. Sign in as an entitled Editor.
2. Select Markdown text.
3. Request optimization.
4. Change the selection while the job runs and confirm automatic replacement is
   refused because the original hash no longer matches.
5. Retry, accept the unchanged selection, and confirm only that range changes.
6. Confirm no revision exists until normal Save is used.

### Image generation

1. Generate from the whole page and from selected text.
2. Confirm the preview is private and no normal content asset exists yet.
3. Discard one preview and confirm it cannot be loaded.
4. Promote another preview and insert the returned `/api/assets/{id}` reference.
5. Save/publish normally and verify existing asset permissions and storage
   replication behavior.

## API documentation

Any route/schema change must regenerate documentation through next-openapi-gen:

```bash
pnpm --filter @next-wiki/web openapi:generate
```

The generator requires Node.js 20.9 or newer. This feature was generated with
Node.js 24; Node.js 18 fails while loading modern JSON import attributes.

Verify:

```bash
curl -fsS http://127.0.0.1:3000/api/openapi.json >/dev/null
```

Open `/api-docs` and confirm the AI resources and SSE endpoint are present.

## Test suite

Run static and integration checks:

```bash
pnpm --filter @next-wiki/shared typecheck
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web test
```

Run E2E with deterministic provider fixtures:

```bash
pnpm --filter @next-wiki/web test:e2e
```

Required coverage:

- provider secret redaction and model capability precedence;
- global disable produces zero outbound calls;
- entitlement and Editor/Admin mutation gates;
- pg-boss retries, cancellation, stale-page suppression, and boot recovery;
- mixed embedding dimensions remain isolated by generation;
- permission-safe search and citations;
- SSE reconnect using `Last-Event-ID`;
- pg-boss payloads contain only action ids; request content exists only in
  encrypted TTL inputs;
- no prompt/response/image content in permanent audit rows or logs;
- generated artifact expiry and idempotent promotion;
- OpenAPI generation and docs rendering.

## Implementation verification record

The following checks completed successfully on June 20, 2026:

```bash
pnpm --filter @next-wiki/shared typecheck
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
docker compose up -d --build
```

The production Docker build compiled all AI Admin, search, Q&A, optimization,
image, artifact, action, and entitlement routes. Before running integration or
E2E tests, verify that any local `POSTGRES_IMAGE` override resolves to
`pgvector/pgvector:0.8.3-pg16`; the vector migration intentionally fails on a
plain PostgreSQL image.

## Failure drills

- Stop the provider fixture while actions are queued: actions fail clearly and
  Wiki reads/edits remain healthy.
- Restart the web container during indexing: pending/running work is recovered
  idempotently.
- Disable the provider/model assigned to a purpose: new actions are rejected;
  no automatic fallback occurs.
- Return malformed vectors or wrong dimensions: the page batch fails without
  partial chunk replacement.
- Return an oversized/non-image generation result: artifact creation is
  rejected and the draft remains unchanged.
