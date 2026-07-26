# API Contract Delta: Outbound Request Logging

All routes are authenticated Admin operations. They use the existing JSON error
envelope, `createApiContext`, permission checks, `mapDomainError`, and
`withApiAudit`. They are dynamic and must not be cached. API-key actors are
denied even when the owning user has an Admin role.

The shared runtime schemas live in `packages/shared/src/request-log.ts`; the
OpenAPI scanner copies the route shapes into
`apps/web/src/server/api/openapi-schemas.ts`. Regenerate
`apps/web/public/openapi.json` after route annotations or scanner schemas change.

## Settings

### `GET /api/request-log/settings`

Returns the current capture policy and a short sensitivity warning.

Response:

```json
{
  "enabled": false,
  "level": "status",
  "retentionHours": 24,
  "updatedAt": null,
  "updatedBy": null,
  "allConfirmationRequired": true
}
```

`updatedBy` is an Admin-safe identifier/display projection and never includes a
credential. When no settings row exists, the response returns the documented
defaults.

### `PATCH /api/request-log/settings`

Request:

```json
{
  "enabled": true,
  "level": "all",
  "retentionHours": 24,
  "confirmSensitiveCapture": true
}
```

Rules:

- `level` is one of `status`, `header`, `all`.
- `retentionHours` is an integer from `1` through `168`.
- `confirmSensitiveCapture` is required and must be `true` when enabling `all`.
- Turning capture off does not delete existing rows.
- The service records the previous/new setting in the existing API audit trail.

Response: the updated settings view.

Errors: `UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`.

## Request list

### `GET /api/request-log`

Query parameters:

| Parameter | Type | Rules |
|---|---|---|
| `page` | integer | Default `1`, minimum `1` |
| `pageSize` | integer | Default `20`, maximum `100` |
| `startTime` / `endTime` | ISO timestamp | Optional inclusive range |
| `sourceType` | string | Optional bounded source filter |
| `providerKey` | string | Optional provider/integration filter |
| `operation` | string | Optional operation filter |
| `outcome` | enum | `success`, `http_error`, `transport_error`, `timeout`, `cancelled`, `invalid_response` |
| `statusCode` | integer | Optional exact HTTP status |
| `correlationId` | string | Optional exact trace identifier |

Response:

```json
{
  "entries": [
    {
      "id": "uuid",
      "sourceType": "ai",
      "providerKey": "openrouter-main",
      "operation": "chat.completions",
      "attempt": 1,
      "method": "POST",
      "targetHost": "openrouter.ai",
      "targetPath": "/api/v1/chat/completions",
      "statusCode": 401,
      "outcome": "http_error",
      "errorCode": "PROVIDER_UNAVAILABLE",
      "errorMessage": "AI provider rejected the credentials",
      "providerRequestId": "req-123",
      "correlationId": "action-uuid",
      "durationMs": 412,
      "captureLevel": "all",
      "startedAt": "2026-07-26T05:00:00.000Z",
      "completedAt": "2026-07-26T05:00:00.412Z",
      "expiresAt": "2026-07-27T05:00:00.412Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

List responses never include raw target query strings, headers, request bodies,
response bodies, or full error envelopes.

## Request detail

### `GET /api/request-log/{id}`

Returns the list summary plus the fields allowed by the record's immutable
capture level.

For `header` and `all`, headers are returned as ordered pairs:

```json
{
  "name": "x-request-id",
  "values": ["req-123"]
}
```

For `all`, body/error payloads use this envelope:

```json
{
  "encoding": "utf8",
  "contentType": "application/json",
  "contentEncoding": null,
  "byteLength": 42,
  "data": "{\"error\":\"invalid key\"}"
}
```

Binary data uses `encoding: "base64"`. An unavailable body is `null`; a
present empty body has `byteLength: 0`.

The detail response is never placed in a URL or list preview. The UI renders
raw sections collapsed behind a sensitivity warning, but the API returns the
complete captured values to the authorized Admin detail request.

Errors: `NOT_FOUND` is returned for an unknown, expired, or unauthorized record
so the route does not disclose record existence.

## OpenAPI and non-public scope

- Add scanner-compatible `RequestLogSettingsView`,
  `RequestLogSettingsUpdate`, `RequestLogListResponse`, and
  `RequestLogDetailResponse` schemas.
- Annotate the three route groups with Admin-only summaries and responses.
- Do not add these routes to the public `/api/v1` content API or to API-key
  scopes. They are authenticated operational endpoints only.
- Keep all responses dynamic/non-cached, including the list and detail routes.
