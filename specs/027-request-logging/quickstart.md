# Quickstart: Outbound Request Logging

This guide validates the feature end to end after implementation. It assumes
the project dependencies are installed and Docker is available.

## Prerequisites

1. Start PostgreSQL and the application/worker using the project deployment
   path:

   ```bash
   docker compose up -d --build
   ```

2. Create or use an Admin account and configure at least one AI provider in the
   existing Admin AI settings.
3. Confirm the database migration was generated from the Drizzle schema:

   ```bash
   pnpm db:generate
   pnpm db:generate
   ```

   The first command must create the migration/snapshot when schema changes are
   present; the second must report no schema changes. Do not hand-edit the
   generated migration, journal, or snapshot.

## Automated validation

Run the focused tests first, then the repository checks:

```bash
pnpm --filter @next-wiki/web test -- src/server/services/request-log.test.ts src/server/ai/providers/http-client.test.ts
pnpm --filter @next-wiki/web test -- src/server/services/request-log-routes.test.ts
pnpm --filter @next-wiki/web test -- src/components/admin/request-log/RequestLogPanel.test.tsx
pnpm --filter @next-wiki/web exec playwright test e2e/request-log.spec.ts
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web i18n:validate
pnpm --filter @next-wiki/web openapi:generate
```

Expected outcomes:

- all focused Vitest tests pass;
- Playwright proves Admin-only access, URL-restorable filters, and complete
  level-specific detail;
- lint has zero warnings/errors;
- typecheck and i18n validation pass;
- generated OpenAPI contains the request-log schemas/routes and no route is
  added to the public v1 API by accident.

## Manual scenario 1 — Status capture and AI success

1. Open `DATA & OPERATIONS` → `REQUEST LOG`.
2. Confirm capture is off and the list is empty or contains only prior records.
3. Turn capture on, choose `Status`, save.
4. Submit a normal Wiki AI question and wait for completion.
5. Refresh `REQUEST LOG` and filter `sourceType=ai`.

Expected:

- one record exists for each provider request attempt;
- source/provider/operation, method, target metadata, status, outcome,
  duration, correlation ID, and capture level are visible;
- no request/response headers or body section exists in the detail response.

## Manual scenario 2 — Header and All capture for a failing request

1. Change the level to `Header` and run an AI request against an intentionally
   invalid provider credential or test endpoint.
2. Open the failed record and verify every request/response header pair is
   present, including repeated names/multiple values.
3. Change the level to `All`. Confirm the sensitive-data warning and explicitly
   confirm it.
4. Reproduce the same failure, then open the newest record.

Expected:

- `Header` has headers but no bodies/full error envelope;
- `All` has complete available request/response bytes and the complete
  serializable provider/transport error detail;
- the UI identifies sensitive sections and does not put raw values in list rows,
  URLs, browser notifications, or normal process logs;
- the stored raw fields are unreadable without the application encryption key.

## Manual scenario 3 — Stream, timeout, cancellation, and parser failures

1. Use a fixture provider that returns a valid streaming response and verify
   the response body captured at `All` matches the bytes consumed by the AI
   adapter.
2. Make the fixture close the stream early or return malformed SSE/JSON.
3. Repeat with a timeout and with the user Stop/cancel action.

Expected:

- normal chat streaming is not emptied or delayed by the logger;
- malformed response is classified as `invalid_response` with the parser error;
- timeout and cancellation have no HTTP status when no response exists and are
  classified separately;
- each retry attempt is a separate row and shares the operation correlation ID.

## Manual scenario 4 — Generic source reuse

1. In a test-only registered integration, invoke the common outbound request
   wrapper with `sourceType=fixture`, `providerKey=fixture-provider`, and a
   distinct operation.
2. Keep capture enabled and run both the fixture request and an AI request.
3. Filter by source type and by provider.

Expected:

- both sources appear in the same list/detail contract;
- source/provider/operation filters distinguish them;
- no new table, route, or viewer is required for the fixture source.

## Manual scenario 5 — Permission, no-cache, and retention

1. As an Editor, anonymous visitor, and API-key actor, request the settings,
   list, and detail endpoints.
2. Inspect response headers and browser network history to confirm sensitive
   details are not cached or included in URLs.
3. Set retention to `1` hour in a test database, create a record, move its
   `expires_at` into the past, and run the existing cleanup worker path.

Expected:

- every non-Admin/API-key access is denied without revealing record existence;
- settings/list/detail responses are dynamic and not stored as anonymous cache;
- expired rows are absent from normal list/detail reads after cleanup;
- settings changes and request-log route access remain visible in the existing
  Admin audit trail.

## Troubleshooting the validation

- If no AI record is created, verify capture was saved as enabled and the AI
  request traverses the shared provider boundary rather than a test mock that
  bypasses it.
- If a stream body is empty, inspect the tee/collector path before changing
  provider parsing; the consumer branch must remain the adapter's source.
- If a detail route returns raw data to a non-Admin, stop and fix the permission
  check before continuing; do not weaken the test.
- If `db:generate` prompts interactively or folds unrelated changes together,
  stop and repair the missing Drizzle snapshot according to `AGENTS.md` rather
  than hand-authoring migration files.
