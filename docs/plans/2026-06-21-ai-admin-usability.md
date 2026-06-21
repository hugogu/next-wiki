# AI Admin Usability Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Four interconnected improvements: index detail modal, provider/model deletion, unified capability-mapping save, and OpenRouter-based model capability detection with fixed manual model management.

**Architecture:** Area 4 adds a new `ModelDetector` service (OpenRouter `/models` with TTL cache) and rewrites `syncProviderModels` to be capability-aware. Areas 1-3 are focused UI/service changes that surface existing data and wire existing endpoints. 7 commits, ordered so each is independently green.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, React 19, custom i18n, `ModalDialog` primitive.

**Design doc:** `docs/plans/2026-06-21-ai-admin-usability-design.md`

## Progress

- [x] Task 1: Add OpenRouter model detection setting and service
- [x] Task 2: Make model sync capability-aware via OpenRouter detection
- [x] Task 3: Allow manual model addition for all vendors post-creation
- [x] Task 4: Add model and provider deletion
- [x] Task 5: Unify capability mapping save
- [x] Task 6: Convert index detail to modal with failure details
- [x] Task 7: Regenerate OpenAPI + final verification
- [x] Task 8: Refine capability-specific model synchronization
- [x] Task 9: Tighten deletion UX and embedding index reliability

---

### Task 1: Add OpenRouter model detection setting and service

**Files:**
- Modify: `packages/shared/src/ai.ts` — add `openrouterNamespace` to vendor definitions; extend `aiSettingsUpdateSchema` + `aiSettingsViewSchema` (the `readSettings` return shape) with `modelDetectorApiKey?: string | null` and `hasModelDetectorApiKey: boolean`
- Modify: `apps/web/src/server/db/schema/index.ts:397-404` — add `modelDetectorApiKeyEncrypted: text('model_detector_api_key_encrypted')` to `aiSettings`
- Create: `apps/web/src/server/db/migrations/0015_ai_model_detector.sql` (via `pnpm db:generate`, rename)
- Create: `apps/web/src/server/ai/model-detector.ts` — new service
- Modify: `apps/web/src/server/services/ai-admin.ts:81-116` — `readSettings` returns `hasModelDetectorApiKey`; `updateSettings` handles `modelDetectorApiKey` (encrypt on save)
- Modify: `apps/web/app/api/ai/settings/route.ts` — already delegates to service; no change if schema validates
- Modify: `apps/web/src/components/admin/ai/AiSettingsPanel.tsx` — add OpenRouter key input

**Step 1: Add `openrouterNamespace` to vendor definitions**

In `packages/shared/src/ai.ts`, add optional field to `AiProviderVendorDefinition`:
```ts
export type AiProviderVendorDefinition = {
  vendor: AiProviderVendor;
  capabilities: AiProviderType[];
  protocols: Partial<Record<AiProviderType, AiProviderKind>>;
  baseUrls: Partial<Record<AiProviderType, string>>;
  modelDiscovery: AiModelDiscoveryProtocol;
  openrouterNamespace?: string;
};
```
Then add `openrouterNamespace` to the relevant vendor entries: `openai`→`'openai'`, `anthropic`→`'anthropic'`, `kimi`→`'moonshotai'`, `minimax`→`'minimax'`, `zai`→`'z-ai'`. Omit for `voyage`, `openrouter`, `custom`.

**Step 2: Extend settings schema**

In `packages/shared/src/ai.ts`, extend `aiSettingsUpdateSchema`:
```ts
export const aiSettingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  eventRetentionHours: z.number().int().min(1).max(168).optional(),
  artifactRetentionHours: z.number().int().min(1).max(168).optional(),
  modelDetectorApiKey: z.string().min(1).max(8_192).optional(),
});
```
Add a view schema for the settings GET response (or extend the existing return). Add `hasModelDetectorApiKey: z.boolean()` to the settings view.

**Step 3: Add DB column + generate migration**

In `apps/web/src/server/db/schema/index.ts`, add to `aiSettings`:
```ts
modelDetectorApiKeyEncrypted: text('model_detector_api_key_encrypted'),
```
Run `pnpm db:generate`. Rename the generated file to `0015_ai_model_detector.sql`. Update the journal tag. Expected SQL: `ALTER TABLE "ai_settings" ADD COLUMN "model_detector_api_key_encrypted" text;`

**Step 4: Create the ModelDetector service**

Create `apps/web/src/server/ai/model-detector.ts`:
```ts
import { getAiProviderVendor, type AiProviderVendor } from '@next-wiki/shared';
import type { AiCapability } from '@next-wiki/shared';

export type DetectedCapabilities = {
  capabilities: Array<{ capability: AiCapability; supported: boolean; source: 'provider' }>;
  contextWindow?: number;
  maxOutputTokens?: number;
  canonicalId?: string;
  outputModalities: string[];
};

type OpenRouterModel = {
  id: string;
  canonical_slug?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { context_length?: number; max_completion_tokens?: number };
  supported_parameters?: string[];
};

let cache: { at: number; models: Map<string, OpenRouterModel> } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hour

async function loadModels(apiKey: string): Promise<Map<string, OpenRouterModel>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`OpenRouter responded ${response.status}`);
  const payload = await response.json() as { data?: OpenRouterModel[] };
  const map = new Map<string, OpenRouterModel>();
  for (const model of payload.data ?? []) map.set(model.id, model);
  cache = { at: Date.now(), models: map };
  return map;
}

export async function detectCapabilities(
  externalId: string,
  vendor: AiProviderVendor,
  apiKey: string,
): Promise<DetectedCapabilities | null> {
  const ns = getAiProviderVendor(vendor).openrouterNamespace;
  if (!ns) return null;
  const models = await loadModels(apiKey);
  const entry = models.get(`${ns}/${externalId}`);
  if (!entry) return null;
  const input = entry.architecture?.input_modalities ?? [];
  const output = entry.architecture?.output_modalities ?? [];
  const params = entry.supported_parameters ?? [];
  const capabilities: DetectedCapabilities['capabilities'] = [
    { capability: 'text_generation', supported: output.includes('text') || output.length === 0, source: 'provider' },
    { capability: 'vision', supported: input.includes('image'), source: 'provider' },
    { capability: 'audio', supported: input.includes('audio'), source: 'provider' },
    { capability: 'thinking', supported: params.includes('reasoning') || params.includes('include_reasoning'), source: 'provider' },
  ];
  return {
    capabilities,
    contextWindow: entry.top_provider?.context_length ?? entry.context_length,
    maxOutputTokens: entry.top_provider?.max_completion_tokens,
    canonicalId: entry.canonical_slug,
    outputModalities: output,
  };
}

export function clearCache() { cache = null; }
```

**Step 5: Wire settings read/write**

In `ai-admin.ts`, update `readSettings` to include `hasModelDetectorApiKey: Boolean(settings.modelDetectorApiKeyEncrypted)` in the return. Update `updateSettings` to encrypt the key when provided:
```ts
const values = {
  ...input,
  ...(input.modelDetectorApiKey ? { modelDetectorApiKeyEncrypted: encryptAiJson({ apiKey: input.modelDetectorApiKey }) } : {}),
  updatedBy: actorId(ctx),
  updatedAt: new Date(),
};
```
Note: `modelDetectorApiKeyEncrypted` is nullable; omitting the field on PATCH keeps the existing value.

**Step 6: Add UI field in AiSettingsPanel**

Add an input for the OpenRouter API key below the enable switch. PATCH `/api/ai/settings` with `{ modelDetectorApiKey }` on save.

**Step 7: Typecheck + commit**

```bash
pnpm --filter @next-wiki/web typecheck
git add ...
git commit -m "feat(ai): add OpenRouter model detection setting and service"
```

---

### Task 2: Make model sync capability-aware via OpenRouter detection

**Files:**
- Modify: `apps/web/src/server/services/ai-admin.ts:460-539` (`reconcileDiscoveredModel`) and `606-630` (`syncProviderModels`)
- Modify: `apps/web/src/server/jobs/ai-admin.ts` — pass the detector key into the sync flow (read settings)

**Step 1: Rewrite `reconcileDiscoveredModel`**

Replace the blind primary-capability stamping (lines 511-525) with detector-aware enrichment. New signature:
```ts
async function reconcileDiscoveredModel(
  providerId: string,
  providerType: AiProviderType,
  vendor: AiProviderVendor,
  model: DiscoveredModel,
  detector: { apiKey: string } | null,
): Promise<boolean>  // returns false if the model should be skipped (filtered out)
```
Logic:
- If `detector` is configured: call `detectCapabilities(model.externalId, vendor, detector.apiKey)`.
  - If null (not found on OpenRouter): keep the adapter's `mapModel` capabilities but DON'T stamp the primary capability. Return `true` (keep).
  - If found: check `outputModalities` vs `providerType`:
    - `providerType === 'image'` and output excludes `'image'` → return `false` (skip)
    - `providerType === 'embedding'` and output excludes `'embed'`/`'embedding'` → return `false` (skip)
    - Otherwise: merge detected capabilities (vision, thinking, etc.) + set primary capability supported based on output. Enrich `contextWindow`, `maxOutputTokens`, `canonicalId` from detection. Return `true`.
- If `detector` is null (no key configured):
  - `providerType !== 'chat'` → return `false` (skip — manual-only for image/embedding to avoid pollution)
  - `providerType === 'chat'` → use adapter's `mapModel` capabilities WITHOUT the old primary-capability stamping. Return `true`.

**Step 2: Rewrite `syncProviderModels`**

```ts
export async function syncProviderModels(providerId: string) {
  const runtime = await providerRuntime(providerId);
  const discovery = createModelDiscoveryAdapter(runtime);
  if (!discovery) return { count: 0, skipped: 0 };
  const settings = await getAiSettings();
  const detectorKey = settings.modelDetectorApiKeyEncrypted
    ? (decryptAiJson(settings.modelDetectorApiKeyEncrypted) as { apiKey: string }).apiKey
    : null;
  const detector = detectorKey ? { apiKey: detectorKey } : null;
  const models = await discovery.listModels();
  const kept: string[] = [];
  let skipped = 0;
  for (const model of models) {
    const keep = await reconcileDiscoveredModel(providerId, runtime.type, runtime.vendor, model, detector);
    if (keep) kept.push(model.externalId);
    else skipped++;
  }
  if (kept.length) {
    // mark non-manual models not in `kept` as unavailable
    await db.update(schema.aiModels).set({ availability: 'unavailable', updatedAt: new Date() })
      .where(and(eq(schema.aiModels.providerId, providerId), eq(schema.aiModels.manuallyAdded, false), notInArray(schema.aiModels.externalId, kept)));
    await db.update(schema.aiModels).set({ availability: 'available' })
      .where(and(eq(schema.aiModels.providerId, providerId), inArray(schema.aiModels.externalId, kept)));
  }
  return { count: kept.length, skipped };
}
```

**Step 3: Typecheck + lint + test + commit**

```bash
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web test
git commit -m "fix(ai): make model sync capability-aware via OpenRouter detection"
```

---

### Task 3: Allow manual model addition for all vendors post-creation

**Files:**
- Modify: `apps/web/src/components/admin/ai/ModelCatalog.tsx` — add "Add model" button + modal
- Modify: `apps/web/src/components/admin/ai/ProviderForm.tsx:91,112,159` — relax the `modelDiscovery === 'none'` gate so manual entry works for all vendors (or leave ProviderForm as-is and rely on the new ModelCatalog button)
- Modify: i18n

**Step 1: Add "Add model" button + modal to ModelCatalog**

Add state for an `adding` modal. The form fields: `externalId` (required), `displayName` (required), and for embedding providers `embeddingDimensions`. On submit, POST to `/api/ai/providers/${providerId}/models` (the existing endpoint). The `providerId` context: `ModelCatalog` receives `models` which include `providerId` per model — add a provider picker if multiple providers exist, or scope the button to the active provider filter.

The existing `POST /api/ai/providers/[id]/models` endpoint and `createManualModel` service already work for any vendor — no backend change needed.

**Step 2: i18n**

Add keys: `admin.ai.models.add`, `admin.ai.models.externalId`, `admin.ai.models.displayName`.

**Step 3: Typecheck + lint + commit**

```bash
git commit -m "feat(ai): allow manual model addition for all vendors post-creation"
```

---

### Task 4: Add model and provider deletion

**Files:**
- Modify: `apps/web/src/server/services/ai-admin.ts:204-218` — strengthen `deleteProvider`; add `deleteModel`
- Modify: `apps/web/app/api/ai/models/[id]/route.ts` — add `DELETE` handler
- Modify: `apps/web/src/components/admin/ai/ProviderDetail.tsx` — add delete button with confirmation
- Modify: `apps/web/src/components/admin/ai/ModelCatalog.tsx` — add delete action per row
- Modify: i18n

**Step 1: Add `deleteModel` service function**

In `ai-admin.ts`, add after `updateModel` (around line 351):
```ts
export async function deleteModel(ctx: PermCtx, modelId: string): Promise<void> {
  assertCanManageAi(ctx);
  const assigned = await db.query.aiPurposeAssignments.findFirst({
    where: eq(schema.aiPurposeAssignments.modelId, modelId),
  });
  if (assigned) throw new DomainError('MODEL_IN_USE', 'AI model is assigned to a purpose');
  const buildingIndex = await db.query.aiIndexGenerations.findFirst({
    where: and(eq(schema.aiIndexGenerations.modelId, modelId), eq(schema.aiIndexGenerations.status, 'building')),
  });
  if (buildingIndex) throw new DomainError('MODEL_IN_USE', 'AI model is referenced by a building index');
  const deleted = await db.delete(schema.aiModels).where(eq(schema.aiModels.id, modelId)).returning();
  if (!deleted.length) throw new DomainError('MODEL_NOT_FOUND', 'AI model not found');
}
```

**Step 2: Strengthen `deleteProvider`**

Add an index-reference check before the delete (after the existing `active` check):
```ts
const indexedModel = await db.query.aiIndexGenerations.findFirst({
  where: and(
    eq(schema.aiIndexGenerations.modelId, db.select({ id: schema.aiModels.id }).from(schema.aiModels).where(eq(schema.aiModels.providerId, id)).limit(1)),
    eq(schema.aiIndexGenerations.status, 'building'),
  ),
});
```
Simpler approach: check if any model of this provider is referenced by a building index via a subquery join.

**Step 3: Add DELETE handler to models route**

In `apps/web/app/api/ai/models/[id]/route.ts`, add:
```ts
/** @openapi @summary Delete AI model @tag AI Admin @auth bearer */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await deleteModel(await createApiContext(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
```
Import `deleteModel`, `idSchema`, `NextResponse`, `createApiContext` as needed (mirror the providers DELETE route pattern at `providers/[id]/route.ts:39-50`).

**Step 4: Add delete button in ProviderDetail**

Add a delete button (danger variant) below the save form. On click, show a confirmation prompt (use `window.confirm` or a small inline confirm). On confirm, `DELETE /api/ai/providers/${provider.id}`. On success, call `onUpdated` (which refreshes the list). Handle `PROVIDER_IN_USE` error with an Alert message.

**Step 5: Add delete action in ModelCatalog**

Add a delete icon button per row. On click, confirm + `DELETE /api/ai/models/${model.id}`. On success, reload. Handle `MODEL_IN_USE`.

**Step 6: i18n + typecheck + commit**

Add keys: `admin.ai.models.delete`, `admin.ai.providers.delete`, `admin.ai.delete.confirm`, `admin.ai.error.inUse`.
```bash
git commit -m "feat(ai): add model and provider deletion"
```

---

### Task 5: Unify capability mapping save

**Files:**
- Modify: `apps/web/src/components/admin/ai/PurposeAssignments.tsx`

**Step 1: Track dirty state + unified save**

Refactor:
- Add `const [initial, setInitial] = useState(values)` to capture server-side values.
- Compute `const dirty = purposes.filter((p) => values[p] !== initial[p] || (p === 'wiki_embedding' && embeddingDimensions !== initialEmbeddingDimensions))`.
- Remove the per-row `<Button>` (lines 124-149).
- Add a single "Save all" button at the bottom of the section, disabled when `dirty.length === 0` or saving.
- On click: for each dirty purpose, call `apiPut(\`/api/ai/assignments/${purpose}\`, {...})`. Process sequentially. Skip the embedding PUT if the embedding row is unchanged (to avoid unnecessary index rebuilds). On all-success, `window.location.reload()`. On error, set the shared error and stop.

**Step 2: i18n**

Add `admin.ai.assignments.saveAll`.

**Step 3: Typecheck + commit**

```bash
git commit -m "feat(ai): unify capability mapping save"
```

---

### Task 6: Convert index detail to modal with failure details

**Files:**
- Modify: `apps/web/src/components/admin/ai/IndexList.tsx` — replace Details link with a button that opens a modal
- Modify: `apps/web/src/components/admin/ai/IndexDetail.tsx` — render `errorCode`/`errorMessage`; render `lastErrorMessage` in failed-page list
- Delete: `apps/web/app/(admin)/admin/ai/indexes/[id]/page.tsx`
- Modify: i18n

**Step 1: Add modal state to IndexList**

Import `ModalDialog` and `useState`. Replace the `<Link>` at line 63-65 with a `<Button>` that sets `setDetailIndex(index)`. Render the modal:
```tsx
{detailIndex && (
  <ModalDialog title={t('admin.ai.indexDetail.title')} onClose={() => setDetailIndex(null)}>
    <IndexDetail index={detailIndex} />
  </ModalDialog>
)}
```

**Step 2: Enhance IndexDetail with error fields**

After the `<dl>` grid, add a conditional block for failed indexes:
```tsx
{index.status === 'failed' && (index.errorCode || index.errorMessage) && (
  <div className="rounded-md border border-danger/30 bg-danger/5 p-sm">
    <p className="text-xs font-medium text-danger">{index.errorCode}</p>
    {index.errorMessage && <p className="mt-xs text-sm text-danger">{index.errorMessage}</p>}
  </div>
)}
```
Extend the failed-page type to include `lastErrorMessage`:
```ts
const [failedPages, setFailedPages] = useState<Array<{ pageId: string; title?: string; lastErrorCode?: string | null; lastErrorMessage?: string | null }> | null>(null);
```
Update the failed-page list rendering to show `lastErrorMessage`:
```tsx
{failedPages.map((page) => (
  <li key={page.pageId} className="font-mono text-xs">
    <span>{page.title ?? page.pageId}</span>
    <span className="text-muted"> · {page.lastErrorCode ?? 'failed'}</span>
    {page.lastErrorMessage && <p className="mt-xxs font-sans text-muted">{page.lastErrorMessage}</p>}
  </li>
))}
```

**Step 3: Delete the standalone route**

Delete `apps/web/app/(admin)/admin/ai/indexes/[id]/page.tsx`. Keep the list redirect at `indexes/page.tsx` if it exists.

**Step 4: i18n + typecheck + commit**

Add keys for error labels if needed (likely reuse existing).
```bash
git commit -m "feat(ai): convert index detail to modal with failure details"
```

---

### Task 7: Regenerate OpenAPI + final verification

**Step 1: Regenerate OpenAPI**
```bash
pnpm --filter @next-wiki/web openapi:generate
git diff apps/web/public/openapi.json  # verify clean diff
```

**Step 2: Full verification**
```bash
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web test
```

**Step 3: Commit**
```bash
git add apps/web/public/openapi.json
git commit -m "docs(api): regenerate openapi for AI admin usability changes"
```

**Step 4: Docker smoke test**
```bash
# Apply migration to running db
docker compose exec -T db psql -U wiki -d wiki -c "ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS model_detector_api_key_encrypted text;"
# Register in drizzle journal (compute sha256 of the new migration file first)
# Rebuild web
docker compose up -d --build web
# Playwright: verify index detail modal, delete buttons, unified save, add-model modal, OpenRouter key field
```

---

### Task 8: Refine capability-specific model synchronization

Follow-up requirements replace the remaining generic model-sync behavior:

- Run model synchronization synchronously and return `{ count, skipped }`.
  Record a terminal audit action, refresh the capability page, and do not enqueue
  a background job.
- Move the OpenRouter detector key into an independent left-side **Model
  detector** tab.
- Synchronize embedding models through OpenRouter
  `GET /api/v1/embeddings/models`. Show embedding dimensions and multilingual
  support. Keep dimensions manually editable because the endpoint does not
  expose a standard dimension field.
- Do not use generic `/models` discovery for image capabilities. Use
  vendor-bound built-in catalogs where documented (MiniMax `image-01`; z.ai
  `glm-image` and `cogview-4-250304`) and retain manual model creation.
- Remove chat-only columns from image catalogs. Replace chat capabilities in
  embedding catalogs with dimensions and multilingual support.
- Regenerate OpenAPI with a synchronous `200` `AiModelSyncResult` response.

**Verification:**

```bash
docker compose up -d --build
pnpm typecheck
pnpm lint
TEST_DATABASE_URL=postgresql://wiki:wiki@127.0.0.1:15433/wiki_test pnpm test
curl -sf http://127.0.0.1:3000/readyz
```

---

### Task 9: Tighten deletion UX and embedding index reliability

- Place the global AI enable switch on the title row.
- Use the shared `ConfirmDialog` for model and provider deletion.
- Expose provider deletion directly from each capability list and cascade through
  models, assignments, index generations, and completed run records. Keep active
  runs as a deletion blocker.
- Send OpenRouter embedding requests with the configured `dimensions` and
  `encoding_format: float`, then retain strict response validation.
- Mark the index rebuild action failed when any page leaves the generation in
  `INDEX_BUILD_FAILED`; include expected and received dimensions in invalid-vector
  diagnostics.
- Regenerate OpenAPI with the provider deletion cascade semantics.

---

## Out of scope

- Multimodal chat input (architectural invariant).
- Auto OpenRouter namespace resolution for `custom` vendors.
- Index-level `errorDetail` beyond existing fields.
- New unit tests for declarative catalog data (typecheck enforces).
