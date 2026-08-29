# OpenClaw Memory Wiki REST Contract

**Status**: Proposed v1 contract
**Base URL**: `{NEXT_WIKI_URL}/api/v1`
**Feature**: [OpenClaw Memory Wiki Integration](../spec.md)

This contract extends the existing versioned Agent Memory surface. It supports
a native OpenClaw plugin only through server-bound connections; it is not a
generic Raw-page CRUD API.

## Common Rules

- All requests use `Authorization: Bearer {key}` and
  `x-next-wiki-memory-provider-version: {plugin-version}`.
- All successful and error responses are JSON with private, no-store caching.
- The server derives owner, namespace, agent identity, key purpose, remote
  vault root, and permitted spaces from authentication. Request fields cannot
  select or enlarge any of those boundaries.
- Requests are bounded and UTF-8 JSON. The service rejects a body larger than
  the documented input maximum before it creates content.
- Audit records contain endpoint/outcome/correlation metadata only. They omit
  document bodies, titles, paths, source version, query, excerpts, credentials,
  and upstream error bodies.
- The public OpenAPI document is generated from the shared runtime schema and
  route annotations; the prose here is the client integration guide, not a
  substitute for generated OpenAPI.

## Paired OpenClaw Key Provisioning

### `POST /api/api-keys/openclaw`

Creates an owner-managed OpenClaw connection and reveals two distinct secrets
once. This is an authenticated browser/session operation, never an API-key
operation.

**Request**:

```json
{
  "displayName": "Personal OpenClaw Memory Wiki",
  "knowledgeSpaceAccess": ["wiki", "raw", "generated"]
}
```

| Field | Rules |
| --- | --- |
| `displayName` | Required 1–100-character non-secret label for the paired namespace. |
| `knowledgeSpaceAccess` | Optional unique subset of `wiki`, `raw`, `generated`; `wiki` is always present. Raw/Generated require the current owner to be an Admin. |

**201 response**:

```json
{
  "connection": {
    "displayName": "Personal OpenClaw Memory Wiki",
    "mirrorKey": { "id": "uuid", "secret": "nwk_…", "scopes": ["memory.read", "memory.write"] },
    "knowledgeSearchKey": { "id": "uuid", "secret": "nwk_…", "scopes": ["view"], "spaceAccess": ["wiki", "raw", "generated"] }
  }
}
```

The response is the only secret reveal. The client must immediately place the
two values in separate OpenClaw SecretRefs and never persist them in normal
configuration, command history, source code, or a Skill.

**Errors**: `401` unauthenticated session, `403` non-Admin or invalid
Raw/Generated grant, `409` active-key limit or destination conflict,
`422` validation failure.

## Mirror-Key Connection Probe

### `GET /memory/wiki/connection`

Returns content-free readiness for the **mirror key** only.

**Authorization**: active mirror key with `memory.read` and a `mirror` binding.

**200 response**:

```json
{
  "provider": "openclaw-memory-wiki",
  "apiVersion": "v1",
  "connection": { "state": "active", "displayName": "Personal OpenClaw Memory Wiki" },
  "capabilities": { "markdownSnapshotMirror": true, "searchSkill": true },
  "limits": { "maxDocumentBytes": 262144, "maxPathCharacters": 500 }
}
```

No owner ID, namespace ID, credential, vault path, source path, document
metadata, or stored content is returned.

**Errors**: `401` invalid/revoked key, `403` wrong key purpose/scope, `409`
inactive namespace or unavailable Raw space, `426` incompatible client.

## Idempotent Markdown Snapshot Upsert

### `PUT /memory/wiki/documents`

Creates or advances one mirrored Memory Wiki document. It writes the full
current Markdown snapshot through the existing Raw content lifecycle and never
appends a new file version to prior file content.

**Authorization**: active mirror key with `memory.write` and a `mirror`
binding.

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
| `idempotencyKey` | Required 1–128-character client-generated value, unique for a normalized source attempt. Reuse with different normalized input is `409`. |
| `sourcePath` | Required exact relative UTF-8 `.md` path, 1–500 characters. No absolute path, empty segment, traversal, symlink marker, `_attachments`, `.openclaw-wiki`, control character, or case-fold collision. |
| `content` | Required UTF-8 Markdown, 1–262,144 bytes. Stored verbatim as the complete source snapshot. |
| `sourceDigest` | Required lowercase SHA-256 of exactly `content`; server recomputes and rejects a mismatch. |
| `sourceVersion` | Optional bounded non-secret diagnostic hint. It cannot override digest, authorization, or revision order. |

**201 created / 200 updated or unchanged response**:

```json
{
  "outcome": "updated",
  "document": {
    "documentId": "uuid",
    "sourcePath": "entities/alex.md",
    "remotePath": "agent-memory/openclaw/…/entities/alex",
    "sourceDigest": "sha256-hex",
    "citation": {
      "pageId": "uuid",
      "revisionId": "uuid",
      "revisionHash": "sha256-hex",
      "canonicalUrl": "https://wiki.example/spaces/raw/…"
    }
  }
}
```

`created` creates a Raw page and first published revision. `updated` creates a
new complete revision only when the accepted digest changed. `unchanged` returns
the current citation and writes no revision. A collision, invalid path, digest
mismatch, unavailable Raw mode, or incompatible replay is rejected without a
partial page write.

## Knowledge Search

### `GET /memory/wiki/search`

Runs a bounded, on-demand search across every content space the paired
knowledge-search key currently may read.

**Authorization**: active key with `view`, `knowledge_search` binding, and the
same active OpenClaw namespace/owner as its paired mirror key.

**Query**:

| Parameter | Rules |
| --- | --- |
| `q` | Required 1–200-character search term. |
| `scope` | Optional `path`, `title`, `content`, or `all`; default `all`. |
| `pathPrefix` | Optional valid next-wiki subtree constraint. |
| `limit` | Optional 1–20; default 10. |
| `excerptLength` | Optional 20–500; default 200. |

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
      "ref": "page-uuid:revision-uuid",
      "space": "raw",
      "title": "Alex",
      "path": "agent-memory/openclaw/…/entities/alex",
      "sourcePath": "entities/alex.md",
      "excerpt": "…",
      "citation": { "pageId": "uuid", "revisionId": "uuid", "canonicalUrl": "https://wiki.example/spaces/raw/…" }
    }
  ]
}
```

`complete=false` means at least one potential content space is unavailable to
the current key/role/mode; it never names hidden pages or reports a hidden
result count. An empty `results` array is a valid no-readable-match response.

## Read One Search Result

### `GET /memory/wiki/pages/{pageId}`

Reads one currently readable page selected by a search result.

**Authorization**: same as knowledge search; page visibility is rechecked.

**Query**: `maxChars` is optional, 1–20,000, default 8,000. The service returns
the leading bounded Markdown source and `truncated: true` where applicable.

**200 response**:

```json
{
  "ref": "page-uuid:revision-uuid",
  "space": "generated",
  "title": "Customer profile",
  "path": "profiles/customer",
  "content": "---\n…",
  "truncated": false,
  "citation": { "pageId": "uuid", "revisionId": "uuid", "revisionHash": "sha256-hex", "canonicalUrl": "https://wiki.example/spaces/generated/…" }
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
