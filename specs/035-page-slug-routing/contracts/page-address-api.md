# Contract: Page Address Surfaces

**Feature**: 035-page-slug-routing | **Date**: 2026-08-20

Four external surfaces change: the reader URL contract, the internal page API,
the public v1 content API, and MCP tooling. Error codes flow through the
existing `DomainError` → HTTP mapping in `apps/web/src/server/api/errors.ts`
and `api/public-errors.ts`.

---

## 1. Reader URL contract

| Address | Response |
|---|---|
| `/{prefix}/{slug}` | `200` — the ISR document. This is the canonical address. |
| `/{prefix}/{locale}/{source-slug}` | `200` — the translation's document; canonical for that translation. |
| `/{prefix}/{alias}` | `301` → `/{prefix}/{slug}`, single hop, cached. |
| `/{prefix}/{retired-prefix-alias}/…` | `301` → current prefix + canonical address (existing behavior, now composed with page aliases). |
| `/{slug}` (no prefix) | `301` → `/{default-prefix}/{slug}` (existing legacy behavior, unchanged). |
| Address of a page the caller cannot read | Exactly the response a direct request for that page produces — `404` or the forbidden surface. **Never** a `301`, never a canonical address in any header or body. |
| Address of a soft-deleted page | `404`. The address remains owned and unavailable to other pages. |
| Unknown address | `404`. |

Every `200` reader response declares exactly one `<link rel="canonical">`,
pointing at the canonical address (FR-011). `hreflang` alternates continue to
be emitted per translation, now built from slugs.

**Resolution order** in `services/reader-routing.ts`:

1. Resolve the space from segment 1 (existing prefix + prefix-alias logic).
2. If segments 2..n start with a two-letter locale and the remainder matches a
   source page's `slug` → translation, render.
3. If segments 2..n match a `pages.slug` in that space → original, render.
4. If segments 2..n match a `page_addresses.address` in that space → resolve
   the target page, **check read permission on the target**, then `301` to its
   canonical address.
5. Otherwise `404`.

Step 4 runs after steps 2–3 so a live canonical address always wins over a
stale alias.

---

## 2. Internal page API

### `PATCH /api/pages/{path}/properties`

Existing endpoint; request body gains `slug`.

```jsonc
// request
{
  "path": "operations/onboarding/install",  // optional, existing
  "title": "Install",                       // optional, existing
  "slug": "install",                        // optional, NEW
  "baseRevisionId": "…"                     // optional, existing
}
```

```jsonc
// 200
{
  "pageId": "…",
  "newPath": "operations/onboarding/install",
  "slug": "install",
  "url": "/wiki/install",
  "retainedAlias": "getting-started/install"  // present when a published page's slug changed
}
```

Requires `edit` on the page — the same check the endpoint already performs.

An address mutation does **not** create a page revision and does **not** move
`latestVersionId`, so a client's held `baseRevisionId` stays valid across it
(research R13).

### `GET /api/pages/{path}/addresses`

```jsonc
// 200
{
  "canonical": { "address": "install", "url": "/wiki/install" },
  "aliases": [
    { "id": "…", "address": "getting-started/install", "kind": "retained",
      "reason": "slug_change", "createdAt": "2026-08-20T…" },
    { "id": "…", "address": "quickstart", "kind": "manual",
      "createdAt": "2026-08-20T…" }
  ]
}
```

### `POST /api/pages/{path}/addresses`

```jsonc
// request
{ "address": "quickstart" }
```

`201` with the created alias. Requires `edit` on the page. Always creates
`kind: "manual"`.

### `DELETE /api/pages/{path}/addresses/{id}`

- `kind: "manual"` → requires `edit` on the page.
- `kind: "retained"` → requires `manage` on the space **and**
  `?confirmBreakingPublicLinks=true`; without the flag returns `409
  ADDRESS_ALIAS_RETAINED` carrying the warning text (FR-022).

### `DELETE /api/pages/{path}/addresses?release=true`

Releases every address of a **soft-deleted** page back to the available pool.
Requires `manage` on the space. Returns `409 PAGE_NOT_DELETED` when the page is
live. Writes an audit entry (FR-014a).

### Error codes

| Code | HTTP | When |
|---|---|---|
| `PAGE_SLUG_INVALID` | 400 | Fails `pageAddressSchema` — empty, too long, malformed separators, uppercase, or non-ASCII. Message states the allowed form. |
| `PAGE_SLUG_RESERVED` | 409 | Leading segment is a built-in route, a two-letter locale, or a static-site reserved prefix. Message names the reserved word. |
| `PAGE_SLUG_TAKEN` | 409 | Address is owned by another page's canonical slug — including a soft-deleted page. Names the holder only when the caller may read it. |
| `PAGE_ADDRESS_TAKEN` | 409 | Address is an existing alias of another page. Same disclosure rule. |
| `PAGE_ADDRESS_SELF` | 400 | Alias equals the page's own canonical slug. |
| `ADDRESS_ALIAS_RETAINED` | 409 | Retained alias removal attempted without confirmation. |
| `PAGE_NOT_DELETED` | 409 | Address release attempted on a live page. |

---

## 3. Public v1 content API

Additive only. `path` keeps its meaning and remains the lookup key, so existing
clients are unaffected (FR-028).

### `GET /api/v1/pages/{id}` and `GET /api/v1/pages?path=…`

Response gains:

```jsonc
{
  "path": "operations/onboarding/install",
  "slug": "install",
  "url": "/wiki/install",
  "aliases": [
    { "address": "getting-started/install", "kind": "retained", "createdAt": "…" }
  ]
}
```

`slug` and `url` also appear on list, tree, search-result, and backlink
payloads wherever `path` appears today.

### `PATCH /api/v1/pages/{id}`

Accepts `slug` alongside the existing `path` and `title`. Uses the existing
page-write scope — **no new API key scope** (research R10). Same error codes as
§ 2, mapped through `api/public-errors.ts`.

### `POST /api/v1/pages` and `POST /api/v1/pages/batch`

Accept an optional `slug` per page. When omitted, the slug defaults to the full
tree path (FR-004). Batch creation resolves the whole set deterministically and
reports adjustments:

```jsonc
{
  "created": [ … ],
  "addressAdjustments": [
    { "path": "Guides/Café", "address": "guides/caf-", "reason": "invalid_characters" },
    { "path": "guides/setup", "address": "guides/setup-2", "reason": "taken" }
  ]
}
```

A batch never partially applies conflicting addresses.

### OpenAPI

`apps/web/src/server/api/openapi-schemas.ts` gains the address schemas; the
generated `/api/public-openapi.json` picks them up. Watch the
`next-openapi-gen` JSDoc quirks recorded in project memory — a schema name that
collides with an unrelated same-named type elsewhere in the workspace is
silently mis-resolved.

---

## 4. MCP tooling

`packages/mcp-server`:

- `next-wiki_get_page`, `next-wiki_list_pages`, `next-wiki_get_page_tree`,
  `next-wiki_search_wiki`, `next-wiki_get_backlinks` — responses gain `slug`,
  `url`, and (for `get_page`) `aliases`.
- `next-wiki_update_page_properties` — accepts `slug`.
- `next-wiki_create_page`, `next-wiki_batch_create_pages` — accept an optional
  `slug`; report `addressAdjustments`.

No new MCP tool and no new scope. An agent that only knows `path` continues to
work exactly as before.

---

## 5. Import and migration contracts

### Wiki.js import

Each imported page's slug is its Wiki.js source path (FR-025). When that path
cannot be used verbatim, `deriveImportAddress` (research R8) produces a
deterministic conforming address and the run result records:

```jsonc
{
  "sourcePath": "Guides/Café Setup",
  "address": "guides/caf-setup",
  "reason": "invalid_characters"   // | "reserved" | "taken"
}
```

`reason: "taken"` never modifies the page that already holds the address.

### Import preview

`jobs/transfer-preview.ts` output gains the resulting `address` per item plus
the same adjustment reasons, so an operator sees every public address before
running (FR-025).

### Archive export / import

The archive manifest gains `slug` and the page's alias list per page, so a
round trip preserves every public address (FR-027).

### Cross-space migration

Writes `page_addresses` rows (`kind: 'retained'`, `reason:
'cross_space_migration'`) against the **source** space instead of
`page_route_redirects`, preserving today's behavior through the new mechanism.

---

## 6. Static site

The published artifact addresses each eligible page by `slug` and emits, per
alias, a stub at `<alias>/index.html` containing a
`<meta http-equiv="refresh">` and a `<link rel="canonical">` to the canonical
address — a static host cannot issue a 301 (research R12).
`findPathConflicts` runs over slugs and alias addresses together, so a
case-only collision between the two still fails the run before anything is
written.
