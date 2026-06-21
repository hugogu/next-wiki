# z.ai Provider Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Register z.ai (Zhipu / GLM) as a first-class AI provider vendor for chat, embedding, and image capabilities, reusing the existing `openai_compatible` adapter kind.

**Architecture:** New `zai` vendor entry in the shared catalog maps all three capabilities to `openai_compatible` with base URL `https://api.z.ai/api/paas/v4`. No new adapter file, no new kind, no registry or http-client changes — the existing `OpenAiCompatibleAdapter` already handles Bearer auth, streaming chat, URL image responses, embeddings, and `/models` discovery.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, PostgreSQL, React, custom i18n.

**Design doc:** `docs/plans/2026-06-21-zai-provider-design.md`

---

### Task 1: Add `zai` to shared vendor catalog and Drizzle enum

**Files:**
- Modify: `packages/shared/src/ai.ts:13-21` (enum), `packages/shared/src/ai.ts:81-98` (catalog entry)
- Modify: `apps/web/src/server/db/schema/enums.ts:81-89`

**Step 1: Add `zai` to the shared Zod vendor enum**

In `packages/shared/src/ai.ts`, edit the `aiProviderVendorSchema` enum (lines 13-21) to insert `'zai'` before `'custom'`:

```ts
export const aiProviderVendorSchema = z.enum([
  'openai',
  'openrouter',
  'anthropic',
  'kimi',
  'voyage',
  'minimax',
  'zai',
  'custom',
]);
```

**Step 2: Add the `zai` vendor definition to the catalog**

In the same file, insert this entry into `AI_PROVIDER_VENDORS` between the `minimax` entry (ends line 87) and the `custom` entry (starts line 88). Keeping `custom` last is intentional — it is the catch-all fallback:

```ts
  {
    vendor: 'zai',
    capabilities: ['chat', 'embedding', 'image'],
    protocols: {
      chat: 'openai_compatible',
      embedding: 'openai_compatible',
      image: 'openai_compatible',
    },
    baseUrls: {
      chat: 'https://api.z.ai/api/paas/v4',
      embedding: 'https://api.z.ai/api/paas/v4',
      image: 'https://api.z.ai/api/paas/v4',
    },
    modelDiscovery: 'openai',
  },
```

**Step 3: Add `zai` to the Drizzle enum**

In `apps/web/src/server/db/schema/enums.ts`, edit `aiProviderVendorEnum` (lines 81-89) to insert `'zai'` before `'custom'`:

```ts
export const aiProviderVendorEnum = pgEnum('ai_provider_vendor', [
  'openai',
  'openrouter',
  'anthropic',
  'kimi',
  'voyage',
  'minimax',
  'zai',
  'custom',
]);
```

**Step 4: Generate the migration**

Run from repo root:
```bash
pnpm db:generate
```
Expected: a new migration file appears under `apps/web/src/server/db/migrations/` (next index `0014`) containing:
```sql
ALTER TYPE "public"."ai_provider_vendor" ADD VALUE 'zai';
```
A new `meta/0014_snapshot.json` is created and `meta/_journal.json` gains an idx-14 entry.

If drizzle-kit auto-generates a random name (e.g. `0014_lonely_wombat.sql`), rename the file and the journal tag to `0014_ai_vendor_zai` for consistency with the semantic naming used by migrations 0010-0013. Update the `tag` field in `_journal.json` to match.

**Step 5: Verify the generated SQL is a single safe statement**

Read the generated `0014_*.sql` and confirm it contains only `ALTER TYPE ... ADD VALUE 'zai'` (no table rewrites, no locks beyond the brief ADD VALUE). This matches the precedent in `0011_ai_provider_protocols.sql:3-5`.

**Step 6: Commit**

```bash
git add packages/shared/src/ai.ts \
        apps/web/src/server/db/schema/enums.ts \
        apps/web/src/server/db/migrations/0014_ai_vendor_zai.sql \
        apps/web/src/server/db/migrations/meta/_journal.json \
        apps/web/src/server/db/migrations/meta/0014_snapshot.json
git commit -m "feat(ai): register z.ai vendor in catalog and schema"
```

---

### Task 2: Wire the vendor into the admin UI and i18n

**Files:**
- Modify: `apps/web/src/components/admin/ai/ProviderForm.tsx:19-27`
- Modify: `apps/web/src/i18n/locales/en.ts:579-585`
- Modify: `apps/web/src/i18n/locales/zh.ts:560-566`

**Step 1: Add the vendor label mapping**

In `apps/web/src/components/admin/ai/ProviderForm.tsx`, edit `VENDOR_LABELS` (lines 19-27) to insert the `zai` entry before `custom`:

```ts
const VENDOR_LABELS: Record<AiProviderVendor, TranslationKey> = {
  openai: 'admin.ai.vendor.openai',
  openrouter: 'admin.ai.vendor.openrouter',
  anthropic: 'admin.ai.vendor.anthropic',
  kimi: 'admin.ai.vendor.kimi',
  voyage: 'admin.ai.vendor.voyage',
  minimax: 'admin.ai.vendor.minimax',
  zai: 'admin.ai.vendor.zai',
  custom: 'admin.ai.vendor.custom',
};
```

**Step 2: Add the English translation**

In `apps/web/src/i18n/locales/en.ts`, insert after the `minimax` line (line 584) and before the `custom` line (line 585):

```ts
  'admin.ai.vendor.zai': 'Z.ai',
```

**Step 3: Add the Chinese translation**

In `apps/web/src/i18n/locales/zh.ts`, insert after the `minimax` line (line 565) and before the `custom` line (line 566):

```ts
  'admin.ai.vendor.zai': 'Z.ai 智谱',
```

**Step 4: Typecheck**

Run:
```bash
pnpm --filter @next-wiki/web typecheck
```
Expected: PASS. If this fails with a `TranslationKey` error, the i18n keys are out of sync between `en.ts`, `zh.ts`, and the `TranslationKey` type derivation — re-check the keys.

**Step 5: Commit**

```bash
git add apps/web/src/components/admin/ai/ProviderForm.tsx \
        apps/web/src/i18n/locales/en.ts \
        apps/web/src/i18n/locales/zh.ts
git commit -m "feat(ai): surface z.ai in provider form and i18n"
```

---

### Task 3: Verify, regenerate OpenAPI, and smoke test

**Files:** None modified (verification + generated artifact only).

**Step 1: Lint**

```bash
pnpm --filter @next-wiki/web lint
```
Expected: PASS with no new warnings.

**Step 2: Run the existing test suite**

```bash
pnpm --filter @next-wiki/web test
```
Expected: PASS. The existing `provider-conformance.test.ts` covers the `OpenAiCompatibleAdapter` behavior that z.ai will use (streaming, embeddings, image URL/b64 responses). No new test is added because the change is declarative catalog data and the TypeScript `Record<AiProviderVendor, TranslationKey>` type already enforces completeness at compile time.

**Step 3: Regenerate OpenAPI doc**

Per AGENTS.md: "When there is API changes, update docs via next-open-api." The shared Zod schemas feed the OpenAPI doc, so the new `zai` enum value appears in the request schemas for `POST /api/ai/providers`, `PUT /api/ai/providers/:id`, and `POST /api/ai/providers/test`.

```bash
pnpm --filter @next-wiki/web openapi:generate
```
Expected: `apps/web/public/openapi.json` is updated; the diff should show `'zai'` added to the vendor enums.

**Step 4: Inspect the OpenAPI diff**

```bash
git diff apps/web/public/openapi.json
```
Confirm only `'zai'` enum additions appear — no unrelated schema drift.

**Step 5: Commit the regenerated OpenAPI doc**

```bash
git add apps/web/public/openapi.json
git commit -m "docs(api): regenerate openapi with z.ai vendor"
```

**Step 6: Docker smoke test**

Per AGENTS.md: "Use `docker compose up -d --build` for testing."

```bash
docker compose up -d --build
```

Once up, optionally verify the migration applied:
```bash
docker compose exec postgres psql -U <user> -d <db> -c "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'ai_provider_vendor'::regtype;"
```
Expected output includes `zai`.

Then, in the running app, sign in as admin, go to Admin → AI → Providers → New, pick each capability (chat / embedding / image), and confirm "Z.ai" / "Z.ai 智谱" appears in the 平台 selector and that selecting it pre-fills `https://api.z.ai/api/paas/v4` as the base URL.

---

## Out of scope (per design doc)

- New adapter kind (no protocol divergence from `openai_compatible`).
- Surfacing `reasoning_content` from streaming (pre-existing limitation).
- Multimodal chat input (current architecture is text-only).
- Downloading z.ai image URLs to permanent storage (downstream pipeline handles `{kind:'url'}`).
- Pre-seeding GLM models (discovery + manual fallback cover it).
- New unit tests for the vendor catalog (declarative data; typecheck enforces completeness).
