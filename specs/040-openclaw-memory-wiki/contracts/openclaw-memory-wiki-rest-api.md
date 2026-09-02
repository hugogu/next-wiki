# OpenClaw Memory Wiki REST Contract

**Status**: Proposed v1 contract
**Base URL**: `{NEXT_WIKI_URL}/api/v1`
**Feature**: [OpenClaw Memory Wiki Integration](../spec.md)

This contract extends the existing versioned Agent Memory surface. A mirrored
file is a generic Agent Memory `source_document` record backed by the existing
Page and Revision model; it supports a native OpenClaw plugin only through
server-bound connections and is not a generic Raw-page CRUD API.

## Common Rules

- All requests use `Authorization: Bearer {key}` and
  `x-next-wiki-memory-provider-version: {plugin-version}`.
- All successful and error responses are JSON with private, no-store caching.
- The server derives owner, namespace, agent identity, key purpose, Page
  storage root, reader address, and permitted spaces from authentication.
  Request fields cannot select or enlarge any of those boundaries.
- Requests are bounded and UTF-8 JSON. The service rejects a body larger than
  the documented input maximum before it creates content.
- Audit records contain endpoint/outcome/correlation metadata only. They omit
  document bodies, titles, paths, source version, query, excerpts, credentials,
  and upstream error bodies.
- The public OpenAPI document is generated from the shared runtime schema and
  route annotations; the prose here is the client integration guide, not a
  substitute for generated OpenAPI.

## Generic Agent Memory Provider Key Provisioning

### `POST /api/api-keys`

Creates one owner-managed Agent Memory provider key and reveals its secret once.
The endpoint is agent-agnostic: OpenClaw, Hermes, Pi, and future adapters use
the same API. This is an authenticated browser/session operation, never an
API-key operation.

**Request**:

```json
{
  "name": "Personal OpenClaw Memory Wiki",
  "scopes": ["view", "memory.read", "memory.write"],
  "spaceAccess": ["wiki", "raw", "generated"],
  "memoryProvider": {
    "displayName": "Personal OpenClaw Memory Wiki",
    "agentIdentity": "openclaw"
  }
}
```

| Field | Rules |
| --- | --- |
| `name` | Required 1–100-character non-secret API-key label. |
| `memoryProvider.displayName` | Optional 1–100-character non-secret label for the namespace. |
| `memoryProvider.agentIdentity` | Required non-empty adapter identity, such as `openclaw`, `hermes`, or `pi`. |
| `scopes` | Ordinary API-key scopes. `memory.read`/`memory.write` control Agent Memory operations; `view` controls next-wiki search and reads. Memory and content scopes are independent. |
| `spaceAccess` | Content-space grants independent from scopes. Wiki is always included; Raw/Generated require an Admin owner. |

**201 response**:

```json
{
  "id": "uuid",
  "name": "Personal OpenClaw Memory Wiki",
  "keySecret": "nwk_…",
  "scopes": ["view", "memory.read", "memory.write"],
  "spaceAccess": ["wiki", "raw", "generated"],
  "memoryDestination": { "id": "uuid", "displayName": "Personal OpenClaw Memory Wiki", "state": "active", "agentIdentity": "openclaw" }
}
```

The response is the only secret reveal. The adapter must immediately place the
single value in its host's approved SecretRef mechanism and never persist it in
normal configuration, command history, source code, or a Skill.

**Errors**: `401` unauthenticated session, `403` non-Admin or invalid
Raw/Generated grant, `409` active-key limit or destination conflict,
`422` validation failure.

## Connection Probe

### `GET /api/v1/memory/wiki/connection`

Returns content-free readiness for the bound key when it has
`memory.write`.

**Authorization**: active bound Agent Memory key with `memory.write`.

**200 response**:

```json
{
  "provider": "next-wiki",
  "apiVersion": "v1",
  "bindingPurpose": "memory_provider",
  "namespace": { "id": "uuid", "displayName": "Personal OpenClaw Memory Wiki", "state": "active", "agentIdentity": "openclaw" },
  "capabilities": { "mirror": true, "immutableRevisions": true, "currentOnly": true },
  "limits": { "maxContentCharacters": 512000, "maxPathCharacters": 400 }
}
```

No owner ID, credential, vault path, source path, document metadata, or stored
content is returned.

**Errors**: `401` invalid/revoked key, `403` missing scope or unbound key, `409`
inactive namespace or unavailable Raw space, `426` incompatible client.

## Idempotent Markdown Snapshot Upsert

### `PUT /api/v1/memory/wiki/documents`

Creates or advances one generic Agent Memory `source_document` backed by a
restricted Raw Page. It writes the full current Markdown snapshot through the
existing Raw content lifecycle, advances the Page's current published Revision,
and never appends a new file version to prior file content.

**Authorization**: active bound Agent Memory key with `memory.write`.

**Request**:

```json
{
  "idempotencyKey": "openclaw:bb3f…",
  "sourcePath": "entities/alex.md",
  "content": "---\npageType: entity\n---\n# Alex\n",
  "sourceDigest": "sha256-hex",
  "sourceVersion": "optional-non-secret-version-hint"
}
```

| Field | Rules |
| --- | --- |
| `idempotencyKey` | Required 1–200-character client-generated delivery key. Reusing it with different content is `409`; accepted delivery keys and digests are retained only in immutable Revision provenance. |
| `sourcePath` | Required exact relative UTF-8 `.md` path, 1–400 characters. No absolute path, empty segment, traversal, backslash, or control character. |
| `content` | Required Markdown, 1–512,000 characters. Stored verbatim as the complete source snapshot. |
| `sourceDigest` | Required lowercase SHA-256 of exactly `content`; server recomputes and rejects a mismatch. |
| `sourceVersion` | Optional bounded non-secret diagnostic hint. It cannot override digest, authorization, or revision order. |

**201 created / 200 updated or unchanged response**:

```json
{
  "outcome": "updated",
  "memoryRecordId": "uuid",
  "pageId": "uuid",
  "revisionId": "uuid",
  "sourcePath": "entities/alex.md",
  "storagePath": "agent-memory/<namespace>/memory-wiki/entities/alex-…",
  "title": "alex",
  "revisionHash": "sha256-hex",
  "citation": {
    "pageId": "uuid",
    "revisionId": "uuid",
    "revisionHash": "sha256-hex",
    "title": "alex",
    "canonicalUrl": "https://wiki.example/spaces/raw/…",
    "createdAt": "2026-08-29T00:00:00.000Z",
    "sourcePath": "entities/alex.md",
    "storagePath": "agent-memory/<namespace>/memory-wiki/entities/alex-…"
  }
}
```

`created` creates a generic source-document record, its Raw Page, and the first
published revision. `updated` creates a new complete revision only when the
accepted digest changed, then advances the record/Page current-revision
pointers. `unchanged` returns the current citation and writes no revision. A
collision, invalid path, digest mismatch, unavailable Raw mode, or incompatible
replay is rejected without a partial page write. `storagePath` is the existing
Page storage tree; the Page's reader address remains independently managed, and
the exact source spelling remains in revision provenance.

## Knowledge Search

### `GET /api/v1/memory/wiki/search`

Runs a bounded, on-demand search across every content space the bound key
currently may read.

**Authorization**: active bound key with `view`; page visibility and current
space grants are rechecked for every request.

**Query**:

| Parameter | Rules |
| --- | --- |
| `q` | Required 1–4,000-character search term. |
| `limit` | Optional 1–20; default 10. |

The endpoint always searches every permitted Wiki, Raw, and Generated space;
the caller cannot use a space parameter to bypass grants. It delegates ranking,
excerpt construction, and page visibility checks to the existing public-content
search service.

**200 response**:

```json
{
  "coverage": { "wiki": true, "raw": true, "generated": false, "complete": false },
  "results": [
    {
      "pageId": "page-uuid",
      "revisionId": "revision-uuid",
      "revisionHash": "sha256-hex",
      "space": "raw",
      "title": "Alex",
      "path": "agent-memory/openclaw/…/entities/alex",
      "excerpt": "…",
      "score": 0.92,
      "canonicalUrl": "https://wiki.example/spaces/raw/…"
    }
  ]
}
```

`complete=false` means at least one potential content space is unavailable to
the current key/role/mode; it never names hidden pages or reports a hidden
result count. An empty `results` array is a valid no-readable-match response.

## Read One Search Result

### `GET /api/v1/memory/wiki/pages/{pageId}`

Reads one currently readable page selected by a search result.

**Authorization**: active bound key with `view`; page visibility is rechecked.

**Query**: `maxChars` is optional, 1–20,000, default 8,000. The service returns
the leading bounded Markdown source and `truncated: true` where applicable.

**200 response**:

```json
{
  "pageId": "page-uuid",
  "space": "generated",
  "title": "Customer profile",
  "path": "profiles/customer",
  "content": "---\n…",
  "truncated": false,
  "canonicalUrl": "https://wiki.example/spaces/generated/…",
  "revisionId": "revision-uuid",
  "revisionHash": "sha256-hex"
}
```

The route returns `404` for both a missing page and a page the key cannot read.
It never turns a search reference into authorization and accepts no alternate
account, space, or revision selector.

## Errors and Retry Behavior

| Status/code category | Plugin behavior |
| --- | --- |
| `400`/`422` validation | Mark only that source item failed; do not retry until source/configuration changes. |
| `401`/`403` key, binding, or space access | Enter degraded status, stop writes/reads with that key, and show a safe repair action. |
| `404` selected result | Treat as unavailable/changed; do not expose cached content as current. |
| `409` idempotency, collision, or unavailable destination | Report safe conflict; retry only a transient destination state after recheck. |
| `429`, `5xx`, timeout, transport failure | Retry the affected digest with bounded full-jitter backoff; do not block chat or compilation. |
| `426` incompatible provider version | Stop the affected capability and require an operator upgrade/downgrade. |

The plugin must never retry a validation/conflict error by changing source path,
digest, destination, or authorization fields automatically.
