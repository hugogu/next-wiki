# Quickstart: Hybrid Page Search

**Companion to**: [plan.md](./plan.md), [data-model.md](./data-model.md), and [page-search contract](./contracts/page-search.md)

This is an implementation verification sequence. It is intentionally ordered so that data integrity and API behavior are proven before browser interaction.

## 0. Baseline

```bash
pnpm install
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test
```

Start the normal local stack and apply migrations before manual checks:

```bash
docker compose up -d --build
pnpm db:migrate
```

## 1. Add and verify the additive database migration

1. Add `search_behavior_action`, `search_records`, and `search_behaviors` in the Drizzle schema.
2. Generate the migration—do not apply handwritten DDL to a database.
3. Verify relations, `ON DELETE` behavior, check constraint, and indexes in unit/schema tests.

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @next-wiki/web test -- search-analytics
```

Expected outcome: retrying the same query record ID makes one `search_records` row; retrying the same behavior event ID makes one `search_behaviors` row; an Escape event cannot carry a page ID.

## 2. Verify current GET search did not change

```bash
pnpm --filter @next-wiki/web test -- public-page-search-routes
pnpm --filter @next-wiki/web test -- public-content-read
```

Expected outcome: existing `GET /api/v1/search/pages` callers receive the same top-level `{items,nextCursor}` response and existing keyword scope/filter tests pass.

## 3. Verify hybrid POST lifecycle

Use a signed-in session or eligible API key. Replace values with local test values.

```bash
curl -sS -X POST http://localhost:3000/api/v1/search/pages \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $NEXT_WIKI_API_KEY" \
  -d '{
    "kind":"query",
    "searchRecordId":"11111111-1111-4111-8111-111111111111",
    "searchSessionId":"22222222-2222-4222-8222-222222222222",
    "q":"authentication",
    "limit":20
  }'
```

Expected outcome: 200 with immediate readable keyword results and `semanticState` of `pending`, `ready`, `unavailable`, `failed`, or `skipped`. Send the exact request again; it must not create another search record or semantic action. If semantic state is pending, retry the same request until a terminal state and confirm a single de-duplicated list.

Repeat as an anonymous public reader or with semantic retrieval disabled. Expected outcome: keyword results remain available with a generic reduced-coverage state; no provider/index detail is revealed.

## 4. Verify behavior recording

```bash
curl -i -X POST http://localhost:3000/api/v1/search/pages \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $NEXT_WIKI_API_KEY" \
  -d '{
    "kind":"behavior",
    "eventId":"33333333-3333-4333-8333-333333333333",
    "searchRecordId":"11111111-1111-4111-8111-111111111111",
    "searchSessionId":"22222222-2222-4222-8222-222222222222",
    "action":"escape"
  }'
```

Expected outcome: `204 No Content`. Repeat the identical request and verify the behavior-row count remains one. Test `result_open` with a readable page ID; test cross-user/session IDs and an unreadable page ID; neither must disclose or record protected content.

## 5. Verify Header behavior in Playwright

```bash
pnpm --filter @next-wiki/web test:e2e -- header-hybrid-search
pnpm --filter @next-wiki/web test:e2e -- navigation
```

The E2E suite must cover:

1. Header search replaces the centered title without obscuring edge controls.
2. Focusing it displays the overlay and moves focus to the input.
3. One character causes no request; a second character shows current results and excerpts.
4. Aborted/delayed earlier responses cannot replace results for the latest query.
5. Pointer and keyboard activation open the canonical page path.
6. Escape clears/closes once, restores focus, stays on the prior page, and records one Escape behavior.
7. Search result/behavior persistence failure does not prevent navigation or closing.
8. Restricted pages never appear in keyword or semantic result fixtures.

## 6. Final verification

```bash
pnpm --filter @next-wiki/web openapi:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker build -f docker/Dockerfile .
```

Confirm generated OpenAPI changes are intentional, migrations are present, and no runtime service or package was added.
