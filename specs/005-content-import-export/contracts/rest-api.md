# Contract: Transfer REST API

All endpoints require an authenticated administrator/session or an API token
with admin scope. Responses use shared Zod schemas and are included in generated
OpenAPI.

## Transfer Sources

### `GET /api/transfer-sources`

Returns reusable source configurations without credentials.

### `POST /api/transfer-sources`

```json
{
  "type": "wikijs",
  "name": "Legacy Wiki",
  "baseUrl": "https://wiki.example.com",
  "apiToken": "secret",
  "allowPrivateNetwork": false,
  "enabled": true
}
```

Response: `201 TransferSourceView`.

### `GET /api/transfer-sources/{id}`

Response: `200 TransferSourceView`.

### `PATCH /api/transfer-sources/{id}`

Updates name/base URL/private-network trust/enabled state and optionally
replaces the token.

### `DELETE /api/transfer-sources/{id}`

Response: `204`. Active runs using the source return `409 SOURCE_IN_USE`.
Historical runs remain with sanitized source metadata.

## Transfer Artifacts

### `POST /api/transfer-artifacts`

Reserve an upload:

```json
{
  "kind": "source_archive",
  "filename": "wiki-export.zip",
  "sizeBytes": 123456
}
```

Response `201`:

```json
{
  "id": "uuid",
  "status": "uploading",
  "contentUrl": "/api/transfer-artifacts/{id}/content",
  "expiresAt": "..."
}
```

### `PUT /api/transfer-artifacts/{id}/content`

- Request content type: `application/zip`
- Body: raw ZIP bytes, streamed
- `Content-Length` required when the client knows it; chunked transfer allowed
- Idempotency: a failed/incomplete `uploading` artifact may be overwritten by
  the same owner; a `ready` artifact returns `409`
- Response: `200 TransferArtifactView` after atomic finalize/hash

Errors: `413 ARCHIVE_TOO_LARGE`, `415 INVALID_ARCHIVE_TYPE`,
`409 ARTIFACT_NOT_UPLOADABLE`.

### `GET /api/transfer-artifacts/{id}`

Metadata only.

### `GET /api/transfer-artifacts/{id}/content`

Streams ready export archive/report or uploaded archive to its owner/admin.
Supports range requests where the local artifact store permits them.

### `DELETE /api/transfer-artifacts/{id}`

Removes bytes and marks metadata deleted. Returns `409 ARTIFACT_IN_USE` if an
active run or reusable completed preview depends on it.

## Transfer Runs

### `GET /api/transfers`

Query:

- `kind`
- `status`
- `sourceId`
- `limit` (default 20, max 100)
- `offset`

Response:

```json
{
  "items": ["TransferRunView"],
  "total": 42
}
```

### `POST /api/transfers`

Creates and enqueues a run. Response: `202 TransferRunAccepted`.

Site export:

```json
{ "kind": "site_export" }
```

Archive preview:

```json
{
  "kind": "archive_preview",
  "sourceArtifactId": "uuid",
  "options": { "conflictStrategy": "skip" }
}
```

Archive import:

```json
{
  "kind": "archive_import",
  "previewRunId": "uuid"
}
```

Wiki.js source test:

```json
{
  "kind": "wikijs_source_test",
  "sourceId": "uuid"
}
```

Wiki.js preview:

```json
{
  "kind": "wikijs_preview",
  "sourceId": "uuid",
  "options": { "conflictStrategy": "skip" }
}
```

Wiki.js import:

```json
{
  "kind": "wikijs_import",
  "previewRunId": "uuid"
}
```

Import creation validates that the preview completed, source fingerprint and
options still match, the source artifact/source remains available, and no
content-mutating run or storage migration is active.

### `GET /api/transfers/{id}`

Returns status, phase, progress, counters, options, sanitized errors, linked
artifacts, and retry/cancellation capabilities.

### `GET /api/transfers/{id}/items`

Query: `kind`, `status`, `action`, `limit`, `offset`.

Returns paginated item outcomes. Content bodies and credentials are never
returned.

### `POST /api/transfers/{id}/cancellation`

Requests cancellation. Response `202 TransferRunView`. Terminal runs return
`409 RUN_NOT_ACTIVE`.

### `POST /api/transfers/{id}/retries`

Creates a new run from failed/cancelled incomplete items while preserving the
old run. Response `202 TransferRunAccepted`.

## Common Errors

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `INVALID_TRANSFER_OPTIONS` | Request/run kind/options mismatch |
| 400 | `INVALID_ARCHIVE` | Manifest, path, checksum, or structure invalid |
| 401 | `UNAUTHORIZED` | No authenticated actor |
| 403 | `FORBIDDEN` | Actor cannot manage transfers |
| 404 | `TRANSFER_NOT_FOUND` | Resource hidden/not found |
| 409 | `TRANSFER_CONFLICT` | Existing path or stale preview conflict |
| 409 | `TRANSFER_ALREADY_RUNNING` | Mutating transfer/storage migration active |
| 409 | `SOURCE_IN_USE` | Active run references source |
| 409 | `ARTIFACT_IN_USE` | Active run/preview references artifact |
| 413 | `ARCHIVE_TOO_LARGE` | Compressed or expanded safety limit exceeded |
| 422 | `UNSUPPORTED_ARCHIVE_VERSION` | Format/version not supported |
| 422 | `UNSUPPORTED_SOURCE_CONTENT` | Source page cannot be converted |
| 502 | `SOURCE_UNAVAILABLE` | Wiki.js or remote asset unavailable |
| 502 | `SOURCE_INVALID_RESPONSE` | GraphQL/asset response malformed |
| 504 | `SOURCE_TIMEOUT` | Bounded remote operation timed out |
