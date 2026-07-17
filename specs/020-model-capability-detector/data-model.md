# Data Model: Model Capability Detector

**Feature**: 020-model-capability-detector
**Date**: 2026-07-17
**Database**: PostgreSQL 16, existing AI tables

## Storage Approach

This feature reuses the existing AI administration schema. No new table is
required for the initial OpenRouter plus Cloudflare detector slice.

Detector-specific values are stored in existing extension points:

- `ai_settings.model_detector_api_key_encrypted`: existing global OpenRouter
  detector credential, retained for backward compatibility.
- `ai_providers.config`: non-secret detector configuration such as
  `modelDetector.source`, `modelDetector.namespace`, and
  `modelDetector.cloudflareAccountId`.
- `ai_providers.credentials_encrypted`: provider-scoped detector credentials,
  including Cloudflare API token when the provider uses the Cloudflare detector.
- `ai_models.raw_metadata`: last detector-owned non-secret catalog metadata,
  provenance, freshness, and partial-enrichment status.
- `ai_model_capabilities.details`: capability-level detector source and evidence
  details.
- `ai_actions.result_metadata`: per-sync counts and detector run summary.

If implementation review finds that multiple independent Cloudflare accounts
must be configured outside provider records, that becomes a follow-up migration.

## Shared Enumerations and Types

### `AiModelDetectorSource`

New shared source vocabulary:

- `openrouter`
- `cloudflare`

### `AiModelDiscoveryProtocol`

Extend the existing shared protocol vocabulary with:

- `cloudflare`

The existing values remain:

- `openai`
- `openrouter`
- `anthropic`
- `none`

### `AiCapability`

No new capability enum is required. The existing vocabulary remains:

- `text_generation`
- `embedding`
- `image_generation`
- `vision`
- `audio`
- `thinking`

### `AiCapabilitySource`

No enum change in this slice. Existing values remain:

- `provider`
- `catalog`
- `manual`

Detector evidence type is captured in capability `details`, not as a new source
owner.

## Configuration Shapes

### Provider detector config

Stored in `ai_providers.config`:

```json
{
  "modelDetector": {
    "source": "cloudflare",
    "cloudflareAccountId": "account-id",
    "namespace": "optional-provider-namespace",
    "includeDeprecated": false,
    "hideExperimental": true
  }
}
```

Rules:

- `source` must be one of the registered detector source IDs.
- `cloudflareAccountId` is required when `source=cloudflare`.
- `cloudflareAccountId` is not a secret but is admin-only configuration.
- `includeDeprecated` defaults to false.
- `hideExperimental` defaults to true.
- Unknown detector config keys are ignored by detector selection and preserved
  only if existing config handling already preserves them.

### Provider detector credentials

Stored inside encrypted `ai_providers.credentials_encrypted`:

```json
{
  "apiKey": "cloudflare-api-token"
}
```

Rules:

- The token is never returned to clients.
- The token is redacted from logs and normalized errors.
- Missing token makes Cloudflare detector sync fail with an authentication or
  configuration error before any network call.

### OpenRouter detector credential

The existing setting remains:

```json
{
  "apiKey": "openrouter-api-key"
}
```

Rules:

- This setting continues to support OpenRouter provider registration and
  marketplace enrichment for hosted vendors.
- Future work may migrate it into a generic detector-credential store, but this
  slice does not require that migration.

## Entities

### Model Capability Detector

Registered server-only implementation for one detector source.

| Field | Source | Rules |
|---|---|---|
| `source` | code registry | Stable source ID: `openrouter` or `cloudflare` |
| `displayName` | code registry | Admin-facing label from i18n |
| `requiresProviderCredentials` | code registry | True for Cloudflare provider-scoped detection |
| `supportsSchemaEnrichment` | code registry | True for Cloudflare |

Validation:

- Every source must be explicitly registered.
- Unknown source IDs are rejected before sync starts.
- Detectors never write database rows directly.

### Detector Run

Represented by an existing `ai_actions` row with `feature='model_sync'`.

| Field | Existing location | Rules |
|---|---|---|
| `providerId` | `ai_actions.provider_id` | Required |
| `detectorSource` | `request_metadata.detectorSource` | Stable source ID |
| `status` | `ai_actions.status` | Uses existing queued/running/completed/failed lifecycle |
| `counts` | `result_metadata` | added, updated, unavailable, skipped, partial |
| `freshness` | `result_metadata` | `fresh` or `cache` |
| `errorCode` | `ai_actions.error_code` | Normalized safe code |

State transitions:

```text
queued -> running -> completed
queued -> running -> failed
queued -> cancelled
running -> cancelled
completed -> expired
failed -> expired
cancelled -> expired
```

Validation:

- Only one non-terminal `model_sync` action should run per provider.
- Failure details must be sanitized before persistence.
- Result metadata must never contain detector credentials or raw prompt/model
  execution payloads.

### Detected Model

Normalized detector output merged into `ai_models`.

| Field | Target | Rules |
|---|---|---|
| `externalId` | `ai_models.external_id` | Required; unique per provider |
| `canonicalId` | `ai_models.canonical_id` | Nullable |
| `displayName` | `ai_models.display_name` | Required |
| `availability` | `ai_models.availability` | available, unavailable, or unknown |
| `contextWindow` | `ai_models.context_window` | Positive integer or null |
| `maxOutputTokens` | `ai_models.max_output_tokens` | Positive integer or null |
| `embeddingDimensions` | `ai_models.embedding_dimensions` | Positive integer or null |
| `inputModalities` | `ai_models.input_modalities` | Normalized string list |
| `outputModalities` | `ai_models.output_modalities` | Normalized string list |
| `rawMetadata` | `ai_models.raw_metadata` | Non-secret detector metadata and provenance |
| `lastSeenAt` | `ai_models.last_seen_at` | Updated when model appears in detector run |

Merge rules:

- Insert new detector-owned models.
- Update detector-owned fields for existing non-manual models.
- Do not overwrite `manually_added=true`.
- Mark previously detected, currently unseen non-manual models unavailable.
- Do not hard delete missing models.

### Capability Evidence

Normalized capability row merged into `ai_model_capabilities`.

| Field | Target | Rules |
|---|---|---|
| `capability` | `capability` | Existing AI capability enum |
| `supported` | `supported` | Boolean evidence result |
| `source` | `source` | `provider` or `catalog` for detector-owned rows |
| `details.detector` | `details` | `openrouter` or `cloudflare` |
| `details.evidence` | `details` | `catalog`, `schema`, or `catalog_and_schema` |
| `details.partial` | `details` | True when schema enrichment failed or was unavailable |

Effective capability precedence remains:

```text
manual > provider > catalog
```

Validation:

- Unknown capability values are dropped or recorded in raw metadata, not inserted
  as unsupported product capabilities.
- Capability support cannot be inferred from model name.
- Unknown evidence cannot satisfy assignment validation unless the administrator
  confirms a manual override.

## No Public Content Delivery Changes

This feature does not alter published page bodies, public metadata, public
navigation, reader route rendering, cache tags, or ISR invalidation.
