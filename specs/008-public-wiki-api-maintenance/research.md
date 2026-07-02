# Research: Public Wiki API Maintenance & Intelligence

## R1 — Soft-delete vs Hard-delete

**Decision**: Soft-delete only (set `deleted_at`). Hard-delete and permanent
purge are out of scope.

**Rationale**: The `pages` table already has a `deleted_at` column and existing
queries already filter `isNull(deleted_at)`. The constitution (P7) mandates
soft-delete by default with tombstone + retention policy. A restore endpoint is
P2 and deferred, but the data must be preserved.

**Implementation**: `DELETE /v1/pages/{id}` sets `deleted_at = now()`. Existing
`listPagesInternal` and `getPageTree` already exclude deleted pages. Need to
add explicit `status=deleted` / `status=all` support to include tombstoned
pages.

## R2 — Backlink Extraction Strategy

**Decision**: Scan-based extraction over published page content at query time.

**Rationale**:
- Current wiki scale is ≤10k pages, each a few KB of Markdown. A full scan takes
  <100ms.
- A `page_links` materialized table would require maintenance triggers on every
  page save/publish/delete — significant complexity for no measurable perf win
  at current scale.
- Scan-based is simpler, correct by construction (always reflects current
  content), and can be upgraded to a cached/materialized table later if
  performance demands.

**Extraction patterns** (regex):
- `[text](relative-path)` — standard Markdown link
- `[text](/absolute-path)` — absolute path link
- Wiki-style references in content

**Scale ceiling**: When page count exceeds ~50k or average page size exceeds
~50KB, introduce a `page_links` table maintained on publish. Document this as
a known scaling boundary.

## R3 — Diff Library Choice

**Decision**: Use the `diff` npm package (jsdiff).

**Rationale**:
- Pure JavaScript, MIT license, zero runtime dependencies.
- Provides `diffLines`, `diffChars`, `createPatch` (unified diff format).
- Well-maintained, 30M+ weekly npm downloads.
- `@types/diff` provides TypeScript definitions.

**Alternatives considered**:
- `fast-diff` (Google's diff-match-patch): more accurate character-level diff
  but produces a different output format not standard unified diff.
- Inline implementation: unnecessary complexity for line-level diffs.
- `unified` package: renders diff objects to unified string, but `diff` already
  includes this via `createPatch`.

## R4 — Batch Atomicity

**Decision**: All-or-nothing transaction wrapping individual page creations.

**Rationale**: The user's stated goal is preventing "重复和混乱" (duplication
and confusion). A partial batch success would create exactly that — some pages
created, others not, with no clean rollback. Drizzle's `db.transaction()` makes
this straightforward.

**Limit**: 50 pages per batch (configurable). Beyond this, clients should use
multiple batch calls. This prevents request timeout issues and keeps the
transaction duration bounded.

## R5 — Stats Query Strategy

**Decision**: Aggregate SQL queries, not in-memory counting.

**Rationale**: COUNT/GROUP BY on indexed columns is O(1)-ish at current scale.
Recent activity uses a simple `WHERE updated_at > now() - interval '7 days'`
query. Directory breakdown groups by `split_part(path, '/', 1)`.

**Orphan detection**: Reuses the backlink scan logic — a page is orphan if it
has zero inbound links. This is O(n²) in the worst case (scan all pages for
each page), so we optimize by building an in-memory set of all linked paths in
a single pass, then checking membership.

## R6 — Similarity Scoring Algorithm

**Decision**: Combine Dice coefficient on path segments + Levenshtein-based
normalized similarity on titles.

**Formula**:
```
pathScore = diceCoefficient(normalizePath(proposedPath), normalizePath(existingPath))
titleScore = 1 - (levenshtein(lowerTitle1, lowerTitle2) / max(len1, len2))
combinedScore = 0.5 * pathScore + 0.5 * titleScore
```

**Threshold**: Default 0.5. Results below threshold are excluded.

**Rationale**: Dice coefficient handles path segment matching well (bigram
overlap). Levenshtein on titles catches typos and rewordings. Combining both
prevents false positives from path-only or title-only matches.

**Alternatives considered**:
- Embedding-based similarity: deferred — requires AI index, which may be
  disabled. String-distance heuristics work without any AI configuration.
- Jaro-Winkler: better for short strings but less interpretable than Dice +
  Levenshtein.

## R7 — Permission Matrix for New Endpoints

| Endpoint | Reader | Editor | Admin |
|---|---|---|---|
| `DELETE /v1/pages/{id}` | 403 | ✅ | ✅ |
| `GET /v1/pages/{id}/backlinks` | ✅ | ✅ | ✅ |
| `GET /v1/pages/{id}/revisions/{v}/diff` | ✅ | ✅ | ✅ |
| `POST /v1/pages/batch` | 403 | ✅ | ✅ |
| `GET /v1/stats` | ✅ (published only) | ✅ | ✅ |
| `POST /v1/search/similar` | ✅ | ✅ | ✅ |

Delete and batch require `can(ctx, 'delete', ...)` / `can(ctx, 'create', ...)`
respectively. Stats returns draft counts only for Editor/Admin.
