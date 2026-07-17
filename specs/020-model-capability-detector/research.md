# Research: Model Capability Detector

**Feature**: 020-model-capability-detector
**Date**: 2026-07-17

## Decision 1: Separate detector adapters from runtime provider adapters

**Decision**: Introduce a server-only Model Capability Detector contract under
`apps/web/src/server/ai/model-detectors/`. Runtime provider adapters continue to
own inference calls. Detector adapters only list/enrich model metadata and return
normalized `DetectedModel` values.

**Rationale**: The current `AiProviderAdapter.listModels()` mixes provider model
listing with runtime inference capabilities. OpenRouter enrichment already lives
outside normal OpenAI-compatible discovery. Cloudflare model search and schema
inspection are also metadata APIs, not a guarantee that next-wiki can execute
that model through the current provider adapter. Separating the boundary keeps
model metadata portable and prevents Cloudflare-specific logic from leaking into
text, embedding, or image generation calls.

**Alternatives considered**:

- Extend every `AiProviderAdapter` with Cloudflare-specific logic: rejected
  because detector evidence and runtime inference have different credentials,
  latency, and failure modes.
- Keep one `model-detector.ts` file and add `if cloudflare` branches: rejected
  because it would preserve the OpenRouter special case and make the third
  detector harder to add.

## Decision 2: Use explicit detector registration and provider-selected source

**Decision**: Add a static detector registry keyed by stable detector source IDs:
`openrouter` and `cloudflare`. Provider definitions and/or provider config select
which detector source to use. Unknown sources are rejected during validation.

**Rationale**: Constitution P10 requires explicit registration. A detector source
ID is a product-level contract, while provider vendor names and external
marketplace namespaces are implementation details. This also lets one provider
use a runtime protocol while selecting a separate detector source when needed.

**Alternatives considered**:

- Infer detector by provider name: rejected because custom and OpenAI-compatible
  providers may use marketplace-hosted models, and future detectors may cover
  multiple vendors.
- Filesystem scanning for detector adapters: rejected by P10.

## Decision 3: Cloudflare detector uses provider-scoped config and credentials

**Decision**: Cloudflare detection reads `cloudflareAccountId` from non-secret
provider config and an API token from the provider's encrypted credentials. The
existing global OpenRouter detector key remains supported for OpenRouter
enrichment and registration.

**Rationale**: Cloudflare model search and schema endpoints are account-scoped.
The account boundary belongs with the provider configuration being synchronized,
not in a global singleton setting. Reusing encrypted provider credentials avoids
a new secret store and satisfies the spec's account-scoping requirement. Keeping
the existing OpenRouter setting preserves current behavior for hosted vendor
enrichment.

**Alternatives considered**:

- Add a new global table for detector credentials: rejected for this slice
  because Cloudflare is provider/account scoped and the existing encrypted
  provider credential payload is sufficient.
- Store Cloudflare token in plain provider config: rejected because detector
  credentials must be treated like AI provider credentials.

## Decision 4: Reuse existing model and capability tables with richer metadata

**Decision**: Do not add detector-specific tables in this slice. Store detector
provenance in `ai_models.raw_metadata`, `ai_model_capabilities.details`, and
`ai_actions.result_metadata`. Keep the current `ai_capability_source` values
(`provider`, `catalog`, `manual`) and use `details.detector` and
`details.evidence` to distinguish OpenRouter catalog, Cloudflare catalog, and
Cloudflare schema evidence.

**Rationale**: The existing model catalog already represents external identity,
availability, modalities, limits, raw metadata, capability rows, manual
overrides, and model sync actions. Adding tables would duplicate state without a
new query need. Manual override precedence already exists through
`effectiveCapabilities()`.

**Alternatives considered**:

- Add `ai_detector_runs` and `ai_detector_evidence` tables: rejected until there
  is a reporting need beyond current action metadata and capability details.
- Add new `schema` capability source enum value: rejected because the source
  concept is trust ownership, while schema/catalog is evidence detail.

## Decision 5: Cloudflare list-plus-schema mapping is partial-success by design

**Decision**: The Cloudflare detector first lists models through Cloudflare model
search, then enriches each model through Cloudflare model schema when available.
List-level success is enough to return a model. Per-model schema failure records
partial status for that model and does not fail the whole run.

**Rationale**: Cloudflare model search gives the available catalog and task
classification. The schema endpoint gives stronger input/output evidence, but it
adds one call per model and may fail independently. The user value is best when
successful models still update and missing schema evidence remains unknown.

**Alternatives considered**:

- Fail the full sync when any schema request fails: rejected because it would
  make one transient model/schema issue block the entire catalog.
- Infer capabilities from model names when schema is missing: rejected because
  the spec requires evidence-based capability support.

## Decision 6: Move detector-backed sync to the `model_sync` action lifecycle

**Decision**: Provider model synchronization that uses a detector runs as a
`model_sync` action/job. The admin route returns the accepted action quickly.
The worker records added, updated, unavailable, skipped, and partial counts in
action result metadata.

**Rationale**: Cloudflare schema enrichment can exceed 500 ms and may need
bounded concurrency, retry-safe status, and partial diagnostics. The existing AI
action lifecycle already provides admin-visible status, safe error recording,
and retention.

**Alternatives considered**:

- Keep the current synchronous `syncProviderModelsNow()` path for all providers:
  rejected because it violates async-first for Cloudflare catalog enrichment.
- Add a separate detector-run resource: rejected because `model_sync` already
  describes the administrator's operation and avoids a duplicate entry point.

## Decision 7: No public API or anonymous content impact

**Decision**: The feature updates authenticated AI administration only. It does
not add a public API for external clients, and it does not affect anonymous
published reader pages or ISR/cache invalidation.

**Rationale**: Model detection is an administrator configuration workflow. The
only external network calls go from the server to configured detector sources.
Public wiki content remains independent of model catalog state.

**Alternatives considered**:

- Expose detector operations through `/api/v1`: rejected because external
  clients should not manage AI provider catalogs in this slice.
