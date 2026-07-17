# Contract: Admin Model Synchronization

**Feature**: 020-model-capability-detector
**Base**: Existing `/api/ai` admin REST surface
**Format**: JSON

All routes require an authenticated administrator with AI management permission.
Responses never include detector credentials.

## Provider Configuration

### `POST /api/ai/providers`

Existing route. The provider payload may include detector config in `config`:

```json
{
  "name": "Cloudflare Detector Source",
  "type": "chat",
  "vendor": "custom",
  "kind": "openai_compatible",
  "baseUrl": "https://example.invalid/v1",
  "config": {
    "modelDetector": {
      "source": "cloudflare",
      "cloudflareAccountId": "account-id",
      "includeDeprecated": false,
      "hideExperimental": true
    }
  },
  "credentials": {
    "apiKey": "write-only-cloudflare-token"
  },
  "enabled": true
}
```

Validation:

- `config.modelDetector.source` must be registered.
- `cloudflareAccountId` is required for `source=cloudflare`.
- `credentials.apiKey` is required for Cloudflare detector sync.
- The response includes `hasCredentials: true`, never the token.

### `PATCH /api/ai/providers/{id}`

Existing route. Supports replacing detector config and credentials using the
same write-only credential semantics as provider credentials.

## Model Sync

### `POST /api/ai/providers/{id}/model-syncs`

Starts or resumes provider model synchronization.

Response for detector-backed sync:

```json
{
  "id": "uuid",
  "feature": "model_sync",
  "status": "queued",
  "providerId": "uuid",
  "eventsUrl": "/api/ai/actions/{id}"
}
```

HTTP status: `202 Accepted`.

Rules:

- The route returns within the request budget and does not perform per-model
  detector calls inline.
- If a non-terminal `model_sync` action already exists for the provider, the
  route returns that action instead of starting a duplicate run.
- AI-disabled mode rejects the request before any detector call can be queued.

Terminal action `resultMetadata`:

```json
{
  "detectorSource": "cloudflare",
  "freshness": "fresh",
  "counts": {
    "added": 4,
    "updated": 12,
    "unavailable": 1,
    "skipped": 0,
    "partial": 2
  },
  "warnings": [
    {
      "modelExternalId": "@cf/meta/example",
      "code": "SCHEMA_UNAVAILABLE"
    }
  ]
}
```

Failure action fields:

- `errorCode`: normalized safe code.
- `errorMessage`: safe administrator message.
- `errorDetail`: sanitized, bounded diagnostic JSON or null.

## Model Views

### `GET /api/ai/models`

Existing route. Model responses continue to use `AiModelView` and include
capability details with detector provenance:

```json
{
  "id": "uuid",
  "providerId": "uuid",
  "externalId": "@cf/meta/llama-example",
  "displayName": "Llama Example",
  "availability": "available",
  "inputModalities": ["text", "image"],
  "outputModalities": ["text"],
  "capabilities": [
    {
      "capability": "text_generation",
      "supported": true,
      "source": "provider",
      "details": {
        "detector": "cloudflare",
        "evidence": "catalog_and_schema"
      }
    },
    {
      "capability": "vision",
      "supported": true,
      "source": "provider",
      "details": {
        "detector": "cloudflare",
        "evidence": "schema"
      }
    }
  ],
  "lastSeenAt": "2026-07-17T00:00:00.000Z"
}
```

Rules:

- Manual capability rows still appear as `source=manual` and take precedence in
  assignment validation.
- Unknown detector evidence is not returned as a positive supported capability.
- The response remains admin-only.

## Manual Overrides

Existing routes are unchanged:

- `PUT /api/ai/models/{id}/capabilities/{capability}`
- `DELETE /api/ai/models/{id}/capabilities/{capability}`

Behavior:

- A manual row overrides detector evidence.
- Removing a manual row reveals the current detector-owned effective state.
- Detector sync never deletes manual rows.
