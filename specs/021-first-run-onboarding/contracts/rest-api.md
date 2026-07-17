# REST API Contract: First-Run Onboarding

**Feature**: 021-first-run-onboarding
**Base**: Existing `/api` REST surface
**Format**: JSON

Setup APIs are not cached. Responses must never include plaintext OpenRouter
credentials or raw provider payloads.

## Setup State

### `GET /api/setup`

Returns the current first-run onboarding state.

Authentication:

- Anonymous callers may read only whether account setup is needed.
- After an Admin exists, detailed setup state requires the signed-in initial
  Admin or an Admin with normal setup access.

Response before Admin exists:

```json
{
  "needed": true,
  "currentStep": "account",
  "accountStatus": "needed"
}
```

Response after account creation:

```json
{
  "needed": true,
  "currentStep": "ai",
  "accountStatus": "created",
  "aiStatus": "not_started",
  "samplePagesStatus": "not_started",
  "summary": {
    "adminCreated": true,
    "ai": null,
    "samplePages": null
  }
}
```

Closed response:

```json
{
  "needed": false,
  "currentStep": "closed"
}
```

Rules:

- Must not expose whether a specific email exists.
- Must not expose AI credential presence to anonymous callers after setup
  closes.
- Direct setup-state reads after setup closes return a closed state or redirect
  at the page layer.

## First Admin Account

### `POST /api/auth/setup`

Existing route. Creates the first Admin account when no active Admin exists.

Request:

```json
{
  "email": "owner@example.com",
  "password": "minimum-eight-characters"
}
```

Success response:

```json
{
  "ok": true,
  "nextStep": "ai"
}
```

Errors:

- `400 BAD_REQUEST`: invalid email or password.
- `403 FORBIDDEN`: an Admin already exists.
- `409 CONFLICT`: email already exists.

Rules:

- Creates exactly one Admin under concurrent submissions.
- Establishes the session for the created Admin.
- Updates setup progress to `account_status=created`.

## OpenRouter Bootstrap

### `PUT /api/setup/ai-bootstrap`

Configures or skips optional OpenRouter AI bootstrap.

Authentication: signed-in Admin during setup.

Skip request:

```json
{
  "mode": "skip"
}
```

Configure request:

```json
{
  "mode": "configure",
  "apiKey": "write-only-openrouter-key",
  "autoAssign": true
}
```

Accepted response for queued/background detection:

```json
{
  "status": "queued",
  "actionId": "uuid",
  "pollUrl": "/api/setup"
}
```

Completed response:

```json
{
  "status": "completed",
  "purposes": {
    "wiki_text": { "status": "configured", "modelId": "uuid", "modelName": "Example Chat" },
    "wiki_embedding": { "status": "configured", "modelId": "uuid", "modelName": "Example Embedding" },
    "wiki_image": { "status": "needs_manual_setup", "reason": "No compatible detected model" }
  },
  "nextStep": "sample_pages"
}
```

Errors:

- `400 BAD_REQUEST`: invalid request shape.
- `403 FORBIDDEN`: caller is not allowed to continue setup.
- `409 AI_DISABLED`: global policy disables AI setup.
- `422 PROVIDER_AUTH_FAILED`: OpenRouter key cannot be validated.
- `429 PROVIDER_RATE_LIMITED`: provider rate limit during validation or sync.

Rules:

- `apiKey` is write-only and never returned.
- Skip mode makes no outbound provider/detector/model calls.
- Existing OpenRouter providers are reused or preserved; no silent overwrite.
- Purpose assignment uses normal AI capability validation.

## Sample Pages

### `PUT /api/setup/sample-pages`

Creates or skips optional example/help pages.

Authentication: signed-in Admin during setup.

Skip request:

```json
{
  "mode": "skip"
}
```

Generate request:

```json
{
  "mode": "generate"
}
```

Success response:

```json
{
  "status": "completed",
  "pages": [
    { "path": "welcome", "status": "updated", "pageId": "uuid" },
    { "path": "help/markdown-syntax", "status": "created", "pageId": "uuid" },
    { "path": "help/main-features", "status": "created", "pageId": "uuid" }
  ],
  "nextStep": "summary"
}
```

Partial response:

```json
{
  "status": "partial",
  "pages": [
    { "path": "welcome", "status": "updated", "pageId": "uuid" },
    { "path": "help/markdown-syntax", "status": "collision" },
    { "path": "help/main-features", "status": "created", "pageId": "uuid" }
  ],
  "nextStep": "summary"
}
```

Errors:

- `400 BAD_REQUEST`: invalid mode.
- `403 FORBIDDEN`: caller cannot continue setup.
- `409 PATH_CONFLICT`: strict mode collision if implemented as blocking.

Rules:

- Generation is idempotent.
- Normal page/revision permissions and validation apply.
- Public content and navigation cache invalidation runs after created/updated
  sample pages.

## Existing AI Action Status

### `GET /api/ai/actions/{id}`

Existing route. Onboarding may reference it from `GET /api/setup` or internal
polling, but setup UI should prefer the setup state summary for user-facing
progress.

Rules:

- Action responses remain secret-free.
- Non-terminal actions keep setup `ai_status` at `queued` or `running`.
