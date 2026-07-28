# Public REST and OpenAPI Contract

## Conventions

- Base path: `/api/v1`.
- Every route uses the existing `withPublicApi` wrapper and API-key authentication.
- JSON and binary responses set `Cache-Control: private, no-store`; image previews also set `X-Content-Type-Options: nosniff`.
- Authorization failures, cross-account action/artifact IDs, and missing resources return the same not-found representation where existence must be hidden.
- Existing `POST /api/v1/assets` multipart upload remains unchanged and continues to return the standard `PublicAssetResource`.

## Resources

| Method and path | Required authorization | Success | Purpose |
| --- | --- | --- | --- |
| `POST /ai/images` | Editor/Admin API-key account; `ai.image` and `edit` scopes; active image entitlement; editable page/revision | `202` `PublicImageGeneration` | Validate page-bound input, create, audit, and enqueue an image action. |
| `GET /ai/images/{actionId}` | Owner account with `ai.image`; Editor/Admin | `200` `PublicImageGeneration` | Poll safe action state and, when ready, artifact links. |
| `DELETE /ai/images/{actionId}` | Same owner/authorization as status | `204` | Request cancellation for a queued/running action; terminal action is idempotently accepted. |
| `GET /ai/generated-artifacts/{artifactId}` | Owning account with `ai.image`; Editor/Admin | `200` image binary | Download the private generated preview. |
| `DELETE /ai/generated-artifacts/{artifactId}` | Owning account with `ai.image`; Editor/Admin | `204` | Discard an unpromoted artifact idempotently. |
| `POST /ai/generated-artifacts/{artifactId}/asset` | Owning account with `ai.image` and `edit`; Editor/Admin; editable bound page | `200` `PublicAssetResource` | Promote artifact through normal upload storage; repeated requests return the same asset. |

## `POST /ai/images`

Request body follows the validated existing image-generation input shape:

```json
{
  "pageId": "page_123",
  "revisionId": "revision_456",
  "source": { "kind": "selection", "text": "Architecture overview", "hash": "sha256:..." },
  "aspectRatio": "16:9"
}
```

`source.kind: "page"` uses the current bound page/revision and carries no caller-provided arbitrary URL. Image-to-image edits, remote fetches, binary input, and bulk request arrays are not accepted.

`202` response:

```json
{
  "id": "action_123",
  "feature": "image_generation",
  "status": "queued",
  "createdAt": "2026-07-28T10:00:00.000Z",
  "updatedAt": "2026-07-28T10:00:00.000Z",
  "pollUrl": "/api/v1/ai/images/action_123"
}
```

## `PublicImageGeneration`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Image action identifier. |
| `feature` | literal `image_generation` | Makes action type explicit. |
| `status` | `queued`, `running`, `succeeded`, `failed`, `cancelled`, or `expired` | Public mapping of internal action state. |
| `createdAt`, `updatedAt` | ISO 8601 timestamp | Lifecycle timestamps. |
| `pollUrl` | relative URL | Status resource. |
| `artifact` | optional object | Present only when status is `succeeded`: `id`, `contentType`, `sizeBytes`, `expiresAt`, `previewUrl`, `promoteUrl`, `discardUrl`. |
| `error` | optional object | Present only for safe terminal failure: stable `code` and user-safe `message`. |

Neither the submit nor polling body includes image bytes, prompts, selection text, model/provider identifiers, or implementation diagnostics.

## Artifact Promotion

`POST /ai/generated-artifacts/{artifactId}/asset` accepts:

```json
{ "pageId": "page_123" }
```

The supplied page must equal the image action’s bound page. A `200` response is the existing public asset representation, including the normal Markdown string and authenticated asset content URL. Promotion stores the link to the content asset; it does not write Markdown into a page revision or publish it.

## Errors

All errors use the existing public error envelope with a stable code and safe message. Add explicit mappings for the relevant domain failures so they do not fall through to an ambiguous validation error.

| HTTP | Code family | Examples |
| --- | --- | --- |
| `400` | `INVALID_REQUEST` | malformed IDs, malformed source/hash, unsupported aspect ratio |
| `401` | `UNAUTHENTICATED` | absent/invalid API key |
| `403` | `INSUFFICIENT_SCOPE`, `AI_IMAGE_NOT_ALLOWED` | missing `ai.image`/`edit`, role, entitlement, or disabled provider capability |
| `404` | `IMAGE_GENERATION_NOT_FOUND`, `GENERATED_ARTIFACT_NOT_FOUND` | unknown or another account’s resource; no existence disclosure |
| `409` | `IMAGE_ACTION_NOT_CANCELLABLE`, `ARTIFACT_NOT_PROMOTABLE` | invalid lifecycle transition, expired/discarded artifact, page/revision no longer editable |
| `422` | `VALIDATION_FAILED` | valid JSON that violates page/revision/selection invariant |
| `429` / `503` | existing quota/provider availability safe code | rate or temporarily unavailable service; never raw provider text |

## OpenAPI Deliverables

Add route annotations and local literal Zod schemas to `apps/web/src/server/api/openapi-schemas.ts` for the request, status, artifact, promotion, and error forms. Regenerate `apps/web/public/openapi.json` with `pnpm --filter @next-wiki/web openapi:generate`. Document the existing multipart `/api/v1/assets` operation as the compatible raw-upload counterpart.
