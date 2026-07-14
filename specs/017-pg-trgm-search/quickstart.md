# Quickstart: Complementary Page Search Engines

**Purpose**: Validate the three-capability search design end to end after implementation.
**Related artifacts**: [specification](./spec.md), [data model](./data-model.md), [HTTP contract](./contracts/page-search.md)

## Prerequisites

- Node.js and pnpm versions supported by the repository.
- PostgreSQL 16 using the project's default `pgvector/pgvector:0.8.3-pg16` image, with the database migration user allowed to create `pg_trgm` and `btree_gin`.
- A seeded/admin-capable local deployment with published English and Chinese pages, plus semantic index data when testing the semantic capability.

Start the local database and application using the repository's normal Docker Compose workflow. Apply the generated 017 migration:

```bash
pnpm db:migrate
```

Verify that the existing lexical index migration is present before testing:

```bash
docker compose exec db psql -U wiki -d wiki -c "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'btree_gin', 'vector');"
```

Expected: `pg_trgm`, `btree_gin`, and `vector` are listed. If a managed PostgreSQL deployment cannot install a required extension, arrange for an administrator to provision it before applying migrations; do not create extensions from a request handler.

## 1. Verify capability settings and validation

1. Sign in as an administrator and open `/admin/search`.
2. Confirm independent full-text, fuzzy, and semantic switches are visible and default to enabled after migration. Confirm the keyword-search timeout defaults to `400 ms` and accepts only `100`–`2,000 ms`.
3. Save a state with full-text off, fuzzy on, and semantic on; refresh and confirm the same state persists.
4. Try to save both full-text and fuzzy off, or a timeout outside the accepted range. Expected: save is rejected with a clear validation message and the last valid state remains active.
5. Restore all three capabilities and the default timeout before the progressive-search scenario.

## 2. Verify complementary retrieval and progressive results

Prepare or identify three readable published pages:

| Page | Query | Expected capability contribution |
|---|---|---|
| `Search Architecture` | `search architecture` | `full_text` exact/term match |
| Chinese content containing `跨境支付对账流程` | `支付对账` and a one-character near variation | `fuzzy` result within the first five |
| A page describing authentication without the literal phrase | a semantic paraphrase | `semantic` after its action completes |

1. Open the Header search overlay and enter a qualifying query.
2. Inspect the first POST response or browser network panel. Expected: it contains `engineStates`; immediate `full_text`/`fuzzy` results are `ready` within the initial response budget, while semantic may be `pending`. If a content window exceeds the database budget, completed title/path windows remain available instead of being discarded.
3. Keep the overlay open. Expected: the same POST request is retried with the same `searchRecordId`, and the result list is refreshed when semantic becomes `ready`.
4. Confirm a page matched by multiple capabilities appears once, preserves `matchSources`, and adds stable `engineSources`.
5. Confirm exact path/title/term results remain ahead of otherwise comparable approximate results.

## 3. Verify independent failure and permissions

1. In a test environment, make the semantic action unavailable or delay it. Expected: lexical results remain usable, semantic is a generic unavailable, failed, or pending state, and no provider/index diagnostic is shown.
2. Disable fuzzy only and repeat the Chinese near-match query. Expected: the capability state is `skipped` and only the fuzzy-specific recall disappears.
3. Run the same queries as a user lacking access to a matching page. Expected: no title, excerpt, source, count, or result reveals that page.
4. Call legacy `GET /api/v1/search/pages` with an existing client fixture. Expected: its request and `{ items, nextCursor }` envelope remain compatible and it does not create an AI action.

## 4. Verify index plans with representative data

Run `EXPLAIN (ANALYZE, BUFFERS)` for the final full-text and trigram adapter queries against a realistic local corpus. Confirm the `simple` full-text predicates use the indexes from `0007_fast_keyword_search.sql`, title fuzzy retrieval uses `pages_space_title_trgm_idx`, and content fuzzy retrieval uses `page_revisions_content_source_trgm_idx` for queries of three or more non-space characters. Record query-plan evidence in the PR or test notes; do not assume that an index supports Chinese recall without exercising the actual PostgreSQL locale/image. Confirm a deliberately slow query is cancelled by PostgreSQL `statement_timeout`, not merely abandoned by the application.

## 5. Automated validation

Run focused tests during implementation, then the repository checks:

```bash
pnpm --filter @next-wiki/web test -- public-content-read search-analytics public-page-search-routes
pnpm --filter @next-wiki/web test:e2e -- header-hybrid-search
pnpm lint
pnpm typecheck
pnpm test
```

The focused suite must cover all capability lifecycle states, rank fusion, settings snapshots, replacement adapter contract tests, Chinese fuzzy fixtures, permission filtering, GET compatibility, and progressive Header polling.

## 6. Implementation verification record (2026-07-14)

- Migration `0014_immediate_search_timeout.sql` was applied to an isolated PostgreSQL verification database. The focused settings, deadline, lexical capability, coordinator, and query-plan suite passed (39 tests). On the representative local wiki corpus, the materialized full-text content query returned 40 `测试` candidates within the default 400 ms database budget, while the scoped fuzzy-title window returned 3 candidates.
- A fresh PostgreSQL test database applied migrations through `0013_scoped_trigram_search.sql`; the four `EXPLAIN (ANALYZE, BUFFERS)` assertions confirmed `pages_keyword_fts_idx`, `page_revisions_content_fts_idx`, `pages_space_title_trgm_idx`, and `page_revisions_content_source_trgm_idx`.
- The full web Vitest suite passed against an isolated `wiki_017_full_test` database. Targeted capability, settings, route, and replacement-adapter suites also passed.
- Playwright passed Header progressive-search coverage (4 tests) and administrator capability-switch coverage (1 test).
- `pnpm --filter @next-wiki/web typecheck`, `pnpm --filter @next-wiki/web lint`, and `pnpm --filter @next-wiki/web i18n:validate` passed; the catalog validator reported 1,121 keys in both locales.
- `docker build -f docker/Dockerfile -t next-wiki:017-search .` completed successfully without a database service. This verifies the production static generation path, including `/search`, no longer performs the failed build-time PostgreSQL connection.
