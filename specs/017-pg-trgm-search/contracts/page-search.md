# Page Search Capability Contract

**Phase 1 output** | **Date**: 2026-07-14
**Extends**: [feature 013 page-search contract](../../013-hybrid-page-search/contracts/page-search.md)

This document preserves feature 013's single page-search resource. It adds stable capability state to the Header POST operation; it does not add a route.

## Compatibility rules

- `GET /api/v1/search/pages` remains the existing idempotent, non-mutating operation with its current request and `{ items, nextCursor }` response contract. It may use enabled immediate lexical capabilities but never starts an asynchronous semantic action.
- `POST /api/v1/search/pages` retains feature 013's `query` and `behavior` request bodies, `searchRecordId` retry semantics, ownership checks, and behavior recording.
- Existing POST fields `semanticState` and `items[].matchSources` remain. `full_text` and `fuzzy` continue to surface as conceptual `keyword` matches; `semantic` continues to surface as a conceptual `semantic` match.

## Stable capability vocabulary

```text
capability: full_text | fuzzy | semantic
state: ready | pending | skipped | unavailable | failed | timed_out
```

These values describe product capabilities, not database extensions, index names, AI providers, or diagnostic details.

## Extended POST query response

The existing response is extended additively:

```json
{
  "searchRecordId": "0a1a8fa6-3713-4f5a-a3e5-64f29d0ab060",
  "semanticState": "pending",
  "engineStates": [
    { "capability": "full_text", "state": "ready", "resultCount": 4 },
    { "capability": "fuzzy", "state": "ready", "resultCount": 2 },
    { "capability": "semantic", "state": "pending", "resultCount": 0 }
  ],
  "items": [
    {
      "page": {
        "id": "9aae7a00-2cd4-4e23-8764-5ed238f06df7",
        "path": "docs/search-design",
        "title": "Search Design",
        "status": "published"
      },
      "excerpt": "…Chinese fragment matching…",
      "score": 0.032,
      "relevanceScore": 0.91,
      "matchSources": ["keyword", "semantic"],
      "engineSources": ["full_text", "fuzzy", "semantic"]
    }
  ]
}
```

| Field | Rules |
|---|---|
| `semanticState` | Existing compatibility field. It mirrors the semantic capability using feature 013's vocabulary; semantic `timed_out` maps to `failed`. |
| `engineStates` | Additive array containing every capability in the attempt snapshot. `resultCount` is after visibility filtering. A disabled capability is `skipped`; no diagnostic reason is returned. |
| `items[].matchSources` | Unchanged conceptual values: `keyword` and/or `semantic`. |
| `items[].engineSources` | Additive stable-capability provenance. It may be absent only for an old stored/compatibility response; new coordinator responses include it. |
| `items[].score` | Fused rank score. Clients must not compare it to legacy GET scores. |
| `items[].relevanceScore` | Compatibility display value only; it is not the cross-engine ordering algorithm. |

The Header polls the same query body while any `engineStates[].state` is `pending`. Every response is a full latest snapshot, not a delta. Results are de-duplicated by page ID and rebuilt through current visibility checks on each response, so a later permission change cannot leak through a stored run.

## Concurrency and failure behavior

- All capabilities enabled in the attempt snapshot start concurrently.
- `full_text` and `fuzzy` use a bounded request-time query budget. `semantic` starts or resumes its existing asynchronous action.
- One capability's `failed`, `timed_out`, `unavailable`, or `skipped` state does not suppress successful results from another capability.
- The response exposes no raw SQL/vector/provider score, exception, index state, candidate count before permission filtering, or protected-page signal.

## Authorization and caching

- Every engine receives the caller permission context, but only the common coordinator projection may create public page fields, excerpts, counts, or fused results.
- The settings resource remains administrator-only.
- The page-search API is request-time and MUST send the project's normal non-cacheable API behavior. It is never part of a reader ISR/static cache.
