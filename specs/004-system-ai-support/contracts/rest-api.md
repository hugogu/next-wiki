# REST API Contract: System-Level AI Support

**Feature**: 004-system-ai-support
**Base**: Existing `/api` REST surface
**Format**: JSON except SSE and generated-image preview bytes

All routes use shared Zod schemas and next-openapi-gen annotations. Provider
credentials are write-only and never returned. Interactive AI execution routes
are session-only in this slice. Admin routes require an Admin session.

## Common action response

Long-running operations return:

```json
{
  "id": "uuid",
  "feature": "wiki_question",
  "status": "queued",
  "eventsUrl": "/api/ai/actions/{id}/events"
}
```

HTTP status: `202 Accepted`.

## Global settings

### `GET /api/ai/settings`

Admin only. Returns global enabled state, current purpose assignments, retention
settings, and health summary.

### `PATCH /api/ai/settings`

Admin only.

```json
{
  "enabled": true,
  "eventRetentionHours": 24,
  "artifactRetentionHours": 24
}
```

Disabling prevents new jobs and causes queued jobs to fail closed before network
access.

## Providers

### `GET /api/ai/providers`

Admin only. Lists providers without secrets.

### `POST /api/ai/providers`

Admin only.

```json
{
  "name": "OpenRouter",
  "kind": "openrouter",
  "baseUrl": "https://openrouter.ai/api/v1",
  "config": {},
  "credentials": {
    "apiKey": "write-only"
  },
  "enabled": true
}
```

Returns provider view with `hasCredentials: true`.

### `GET /api/ai/providers/{id}`

Admin only. Secret-free detail and model-sync status.

### `PATCH /api/ai/providers/{id}`

Admin only. Partial non-secret update and optional credential replacement.
Omitted credentials preserve the current encrypted payload.

### `DELETE /api/ai/providers/{id}`

Admin only. Rejects assigned/in-use providers with `409 PROVIDER_IN_USE`.

### `POST /api/ai/providers/{id}/tests`

Admin only. Creates `provider_test` action and returns 202.

### `POST /api/ai/providers/{id}/model-syncs`

Admin only. Creates `model_sync` action and returns 202.

## Models and capabilities

### `GET /api/ai/models`

Admin only. Query parameters:

- `providerId`
- `capability`
- `availability`
- `source`
- `q`
- `page`
- `pageSize`

### `POST /api/ai/providers/{providerId}/models`

Admin only. Manually creates a model identity when discovery is unavailable.

### `PATCH /api/ai/models/{id}`

Admin only. Updates display/capacity metadata.

### `PUT /api/ai/models/{id}/capabilities/{capability}`

Admin only. Sets a manual capability override.

```json
{
  "supported": true,
  "details": {}
}
```

### `DELETE /api/ai/models/{id}/capabilities/{capability}`

Admin only. Removes the manual override and reveals discovered effective state.

## Purpose assignments

### `GET /api/ai/assignments`

Admin only.

### `PUT /api/ai/assignments/{purpose}`

Admin only.

```json
{
  "modelId": "uuid"
}
```

Purposes: `wiki_text`, `wiki_embedding`, `wiki_image`.

Errors:

- `409 CAPABILITY_MISMATCH`
- `409 MODEL_UNAVAILABLE`
- `409 PROVIDER_DISABLED`
- `422 EMBEDDING_DIMENSIONS_REQUIRED`

Changing `wiki_embedding` returns the created building index generation and
enqueues its rebuild.

## User entitlements

### `GET /api/ai/entitlements/{userId}`

Admin only.

### `PUT /api/ai/entitlements/{userId}`

Admin only.

```json
{
  "questionAnsweringEnabled": true,
  "textOptimizationEnabled": false,
  "imageGenerationEnabled": true
}
```

### `GET /api/ai/entitlements/me`

Signed-in session user. Returns effective switches plus availability reasons
such as missing assignments or globally disabled AI. It does not expose
provider credentials.

## Knowledge index administration

### `GET /api/ai/indexes`

Admin only. Lists generations and aggregate progress.

### `POST /api/ai/indexes`

Admin only. Starts a rebuild using the current embedding assignment.

```json
{
  "reason": "manual"
}
```

Returns 202 action and generation id.

### `GET /api/ai/indexes/{id}`

Admin only. Returns generation progress, pending/failed page counts, and model
identity.

### `GET /api/ai/indexes/{id}/pages`

Admin only. Paginated page states. Filters: `status`, `q`, `page`, `pageSize`.

### `POST /api/ai/indexes/{id}/page-retries`

Admin only.

```json
{
  "pageIds": ["uuid"]
}
```

Empty `pageIds` means all failed pages.

## AI actions

### `GET /api/ai/actions/{id}`

Owner or Admin. Returns non-content action metadata and terminal status.
Providers/models are identified by display name but no secret/config is exposed.

### `GET /api/ai/actions/{id}/events`

Owner or Admin. `text/event-stream`.

Request supports:

- `Last-Event-ID` header;
- optional `after` query parameter for clients unable to set the header.

Event format:

```text
id: 123
event: text_delta
data: {"text":"partial"}
```

The stream sends heartbeat comments, closes after terminal event, and returns
404 for unauthorized callers to avoid action existence leaks.

### `DELETE /api/ai/actions/{id}`

Owner or Admin. Requests cancellation for queued/running actions. Returns 202.

### `GET /api/ai/actions`

Admin only. Paginated operational audit with filters for feature, status,
provider, model, user, and time range. No prompts/responses/generated bytes.

## Semantic search

### `POST /api/ai/searches`

Signed-in session user; global AI must be enabled and an active ready index must
exist.

```json
{
  "query": "How do we deploy the wiki?",
  "limit": 10
}
```

Returns 202 action. `search_results` event:

```json
{
  "results": [
    {
      "pageId": "uuid",
      "title": "Deployment",
      "path": "ops/deployment",
      "locale": "en",
      "revisionId": "uuid",
      "revisionHash": "sha256",
      "excerpt": "…",
      "score": 0.83
    }
  ]
}
```

Only readable pages appear.

## Wiki question answering

### `POST /api/ai/questions`

Signed-in session user; question entitlement required.

```json
{
  "question": "What is our backup process?",
  "mode": "retrieval",
  "currentPage": {
    "pageId": "uuid",
    "revisionId": "uuid"
  }
}
```

Returns 202 action. Events include text deltas and a final citation set:

```json
{
  "citations": [
    {
      "pageId": "uuid",
      "title": "Backup",
      "path": "ops/backup",
      "revisionId": "uuid",
      "revisionHash": "sha256"
    }
  ]
}
```

Errors:

- `403 AI_FEATURE_DISABLED`
- `409 AI_NOT_CONFIGURED`
- `409 INDEX_NOT_READY`
- `422 FULL_CONTEXT_TOO_LARGE`
- `422 INSUFFICIENT_WIKI_EVIDENCE` (may also be a successful user-facing result)

## Selected-text optimization

### `POST /api/ai/optimizations`

Signed-in Editor/Admin; entitlement and page edit permission required.

```json
{
  "pageId": "uuid",
  "revisionId": "uuid",
  "selection": {
    "text": "selected Markdown",
    "hash": "sha256",
    "from": 120,
    "to": 180
  },
  "instruction": "improve_clarity"
}
```

Returns 202. Final `optimization` event:

```json
{
  "replacement": "Improved Markdown",
  "originalHash": "sha256"
}
```

The API never writes the page.

## Image generation

### `POST /api/ai/images`

Signed-in Editor/Admin; entitlement and page edit permission required.

```json
{
  "pageId": "uuid",
  "revisionId": "uuid",
  "source": {
    "kind": "selection",
    "text": "selected content",
    "hash": "sha256"
  },
  "aspectRatio": "16:9"
}
```

`source.kind` may be `page` or `selection`. Returns 202.

Final `image_ready` event:

```json
{
  "artifactId": "uuid",
  "previewUrl": "/api/ai/generated-artifacts/{id}"
}
```

### `GET /api/ai/generated-artifacts/{id}`

Action owner or Admin. Returns temporary image bytes with `Cache-Control:
private, no-store`. Expired/discarded/unauthorized returns 404.

### `DELETE /api/ai/generated-artifacts/{id}`

Owner or Admin. Discards an unpromoted artifact.

### `POST /api/ai/generated-artifacts/{id}/asset`

Owner; rechecks entitlement and page edit permission.

```json
{
  "pageId": "uuid"
}
```

Returns:

```json
{
  "id": "content-asset-uuid",
  "url": "/api/assets/{id}",
  "contentType": "image/png",
  "sizeBytes": 12345
}
```

The client inserts the Markdown reference; the endpoint does not edit the draft.

## Error envelope

Uses the existing API error shape:

```json
{
  "error": {
    "code": "AI_FEATURE_DISABLED",
    "message": "This AI feature is not enabled for your account."
  }
}
```

Provider response bodies and Wiki prompt content never appear in the envelope.

## OpenAPI generation

Every route must include next-openapi-gen metadata and reference exported Zod
schemas from `packages/shared/src/ai.ts`. After changes:

```bash
pnpm --filter @next-wiki/web openapi:generate
```

Validate `/api/openapi.json` and `/api-docs` in Playwright.
