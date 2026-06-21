# AI Admin Usability Overhaul — Design

**Status:** Approved
**Date:** 2026-06-21
**Scope:** Four interconnected improvements to the AI admin section: index detail
modal, provider/model deletion, unified capability-mapping save, and OpenRouter-
based model capability detection with fixed manual model management.

## Motivation

After implementing z.ai provider support, the admin surfaced four gaps:
1. Index detail is a separate page with hidden failure information.
2. Providers and models cannot be deleted (model DELETE doesn't exist; provider
   DELETE exists but is unwired in the UI).
3. Capability mapping requires one save per row instead of a unified save.
4. `/models` discovery returns chat-centric data; `reconcileDiscoveredModel`
   blindly stamps the provider's primary capability on every discovered model,
   polluting image/embedding catalogs with chat models.

## Area 1: Index detail modal + failure details

Convert `IndexDetail` from a standalone page (`/admin/ai/indexes/[id]`) to an
inline modal triggered from `IndexList`. The error fields (`errorCode`,
`errorMessage`, per-page `lastErrorMessage`) already exist on `AiIndexView` and
the `/pages` API response — they are just never rendered.

**Changes:**
- `IndexList.tsx` — replace the Details link with a button opening a Dialog.
- `IndexDetail.tsx` — convert to modal content; render `errorCode`/`errorMessage`
  for failed indexes; render `lastErrorMessage` in the failed-page list.
- Delete `app/(admin)/admin/ai/indexes/[id]/page.tsx`.
- i18n additions for error labels.

No backend changes.

## Area 2: Provider / model deletion

Model DELETE is built from scratch (endpoint + service). Provider DELETE endpoint
exists; strengthen its constraint check and wire it into the UI.

**Model deletion constraints (service layer):**
- Block if the model is assigned to a purpose (`ai_purpose_assignments`) →
  `MODEL_IN_USE`.
- Block if the model is referenced by a building index → `MODEL_IN_USE`.
- Otherwise: hard delete (cascades to `ai_model_capabilities`).

**Provider deletion strengthening:** also check `ai_index_generations` references
on top of the current checks (purpose assignments + queued/running actions).

**UI:** delete buttons with confirmation sub-dialog in `ProviderDetail` (modal)
and `ModelCatalog` (per-row action).

## Area 3: Unified capability-mapping save

Replace the 3 per-row save buttons in `PurposeAssignments` with a single
"Save all" button. Track dirty state per row; batch the PUTs client-side; skip
unchanged rows. Crucially: the embedding row's PUT triggers an index rebuild —
only call it when the embedding assignment actually changed.

Reuses existing `PUT /api/ai/assignments/:purpose` endpoints — no new API.

## Area 4: Model detection via OpenRouter + manual model management

### 4a. New system setting: OpenRouter detector API key

Migration `0015` adds `openrouter_api_key_encrypted` to `ai_settings` (singleton,
encrypted with the same `API_KEY_ENCRYPTION_KEY` used for provider credentials).
Admin UI field in `AiSettingsPanel`. Optional — if unset, sync falls back to the
adapter's `mapModel` for chat providers and manual-only for image/embedding.

### 4b. Vendor namespace mapping + new ModelDetector service

New optional `openrouterNamespace` field on `AiProviderVendorDefinition`:

| Vendor | openrouterNamespace |
|---|---|
| `openai` | `openai` |
| `anthropic` | `anthropic` |
| `kimi` | `moonshotai` |
| `minimax` | `minimax` |
| `zai` | `z-ai` |
| `voyage` | — (not hosted) |
| `openrouter` | — (itself) |
| `custom` | — (unknown) |

New service `src/server/ai/model-detector.ts`:
- Fetches `/api/v1/models` from OpenRouter with the configured key, cached with a
  TTL (1 hour) to avoid repeated calls.
- `detectCapabilities(externalId, vendor)` → matches by `{namespace}/{externalId}`
  → returns `{ vision, thinking, audio, contextWindow, maxOutputTokens,
  canonicalId }` derived from `architecture.input_modalities`,
  `architecture.output_modalities`, `supported_parameters` (reasoning), and
  `top_provider`.
- Not found / no namespace → returns null (caller falls back).

### 4c. Fixed sync logic

`syncProviderModels` becomes capability-aware and replaces the blind
primary-capability stamping in `reconcileDiscoveredModel`:

```
For each model from the provider's /models:
  If OpenRouter detector is configured:
    look up model → get output_modalities
    if provider type is 'image'  and output excludes 'image'  → SKIP
    if provider type is 'embedding' and output excludes 'embed' → SKIP
    otherwise: reconcile with enriched capabilities (vision, thinking)
  Else (no detector key):
    if provider type !== 'chat' → SKIP (manual-only, no catalog pollution)
    otherwise: use adapter's mapModel (current behavior, no stamping)
```

This fully removes the old primary-capability stamping at `ai-admin.ts:511-525`.

### 4d. Manual model management UI

New "Add model" button in `ModelCatalog` for **all** vendors (not just
`modelDiscovery === 'none'`). Opens a small modal: `externalId`, `displayName`,
and (for embedding) `embeddingDimensions`. POSTs to the existing
`POST /api/ai/providers/[id]/models` endpoint (already implemented, just not
wired to the post-creation UI).

This is how `glm-image`, `cogview-4-250304`, and embedding models not in
`/models` get added.

**OpenRouter data quality (verified 2026-06-21):**
- 11 z.ai models hosted (`z-ai/` namespace), with accurate modality metadata.
- `z-ai/glm-4.6v` → `input_modalities: ['image','text','video']` → vision ✓
- `z-ai/glm-5.2` → `supported_parameters: [..., 'reasoning', ...]` → thinking ✓
- 0 embedding models on OpenRouter (embedding stays manual).
- No `glm-image`/`cogview-4` on OpenRouter (image generation stays manual).

## Files touched (summary)

| Area | Backend | Frontend | Migration |
|---|---|---|---|
| 1 | — | `IndexList`, `IndexDetail`, delete page route, i18n | — |
| 2 | `ai-admin.ts` (deleteModel, strengthen deleteProvider), `models/[id]/route.ts` (DELETE) | `ProviderDetail`, `ModelCatalog`, i18n | — |
| 3 | — | `PurposeAssignments`, i18n | — |
| 4 | `model-detector.ts` (new), `ai-admin.ts` (sync rewrite), `AiSettingsPanel` | `ModelCatalog` (Add model), i18n | `0015` |

## Commits

1. `feat(ai): add OpenRouter model detection setting and service`
2. `fix(ai): make model sync capability-aware via OpenRouter detection`
3. `feat(ai): allow manual model addition for all vendors post-creation`
4. `feat(ai): add model and provider deletion`
5. `feat(ai): unify capability mapping save`
6. `feat(ai): convert index detail to modal with failure details`
7. `docs(api): regenerate openapi`

## Out of scope

- Multimodal chat input at the upstream interface (architectural invariant).
- Auto OpenRouter namespace resolution for `custom` vendors (admin adds models
  manually).
- Index-level `errorDetail` beyond existing `errorCode`/`errorMessage`.
