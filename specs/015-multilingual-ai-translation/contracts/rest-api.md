# Contract: Translation Administration REST API

All endpoints require an authenticated administrator session, use shared Zod schemas, and are included in generated OpenAPI. They use the usual domain error envelope. Translation management is not exposed to API keys or MCP in this feature.

## Target languages

| Endpoint | Contract |
|---|---|
| `GET /api/translations/languages` | Lists configured two-letter target languages, enabled state, and default model/prompt metadata. |
| `POST /api/translations/languages` | Adds a normalized target language and optional default model/prompt version. |
| `PATCH /api/translations/languages/{code}` | Enables/disables a language or changes its defaults without altering frozen historical runs. |
| `DELETE /api/translations/languages/{code}` | Retires a language after active work is absent; historical pages/runs remain auditable. |

## Prompt styles

| Endpoint | Contract |
|---|---|
| `GET /api/translations/prompts` | Lists active/retired template summaries and current version metadata. |
| `POST /api/translations/prompts` | Creates a named template and first immutable version. Body: `{ "name": "Technical Chinese", "body": "Translate accurately and preserve Markdown structure." }`. |
| `GET /api/translations/prompts/{id}` | Returns template plus paginated immutable versions. |
| `PATCH /api/translations/prompts/{id}` | Creates a new version from submitted body; never modifies a used version. |
| `DELETE /api/translations/prompts/{id}` | Retires template; history remains readable and new runs are blocked. |

## Translation runs

### `POST /api/translations/runs`

Creates work for exactly one target language and returns `202`.

```json
{
  "targetLocale": "zh",
  "promptVersionId": "uuid",
  "modelId": "uuid",
  "scope": { "kind": "all_published" },
  "mode": "missing"
}
```

`modelId` may be omitted only when the configured translation/text default is available. Scope is `all_published`, `page_ids`, or `paths`; internal refresh work uses the newest source-revision snapshot.

Response: `{ "id": "uuid", "targetLocale": "zh", "status": "queued", "detailUrl": "/api/translations/runs/uuid" }`.

| Endpoint | Contract |
|---|---|
| `GET /api/translations/runs` | Filters: targetLocale, status, kind, modelId, from, to, limit, offset; paginated summaries/progress/usage. |
| `GET /api/translations/runs/{id}` | Frozen model/prompt inputs, lifecycle, counters, current item, usage, sanitized error, predecessor, controls. |
| `GET /api/translations/runs/{id}/items` | Filters status, sourcePageId, q, limit, offset; returns snapshots, target/version refs, attempts, usage provenance/duration, sanitized outcomes. |
| `POST /api/translations/runs/{id}/pause` | Cooperative pause; returns 202. In-flight work reaches one terminal outcome first. |
| `POST /api/translations/runs/{id}/resume` | Requeues same paused run with frozen inputs; processes only unfinished/retryable/reclaimed items. |
| `POST /api/translations/runs/{id}/cancellation` | Cooperative cancellation; terminal runs return 409. |
| `POST /api/translations/runs/{id}/retries` | Creates successor run for failed/cancelled/superseded/selected pages; accepts optional replacement model/prompt and returns 202. |

## Documents and analytics

| Endpoint | Contract |
|---|---|
| `GET /api/translations/documents` | Filters sourcePageId, targetLocale, freshness, limit, offset; returns source/target URLs, current revisions, freshness, last-run summary. |
| `GET /api/translations/documents/{id}/versions` | Paged translation history with source revision, provider/model snapshot, prompt version, run/item, generation time, usage provenance, duration. |
| `GET /api/translations/usage` | Filters from, to, targetLocale, modelId and `groupBy` (`run`, `language`, `model`, `day`); returns outcome counts, separated reported/estimated/unavailable tokens, and durations. |

## Common errors

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `INVALID_TRANSLATION_INPUT` | Invalid language, scope, prompt, or pagination input. |
| 401/403 | `UNAUTHORIZED` / `FORBIDDEN` | Missing session or no translation-management permission. |
| 404 | `TRANSLATION_NOT_FOUND` | Absent/hidden run, document, or version. |
| 409 | `TRANSLATION_ALREADY_RUNNING` | Target language already has active work. |
| 409 | `RUN_NOT_ACTIVE` / `RUN_NOT_PAUSED` | Invalid lifecycle transition. |
| 409 | `MODEL_UNAVAILABLE` / `CAPABILITY_MISMATCH` | Model cannot begin the run. |
| 422 | `SOURCE_NOT_TRANSLATABLE` | Selected page lacks eligible published source. |
| 503 | `AI_DISABLED` / `JOB_QUEUE_UNAVAILABLE` | New work cannot start; durable history remains readable. |
