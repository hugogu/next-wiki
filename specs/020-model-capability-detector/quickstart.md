# Quickstart: Model Capability Detector

**Feature**: 020-model-capability-detector
**Purpose**: Validate OpenRouter regression, Cloudflare detection, partial
schema enrichment, manual override safety, and admin-only detector access.

## Prerequisites

- Dependencies installed with `pnpm install`.
- Test database available for `@next-wiki/web` Vitest suites.
- `API_KEY_ENCRYPTION_KEY` set for local runs or using the project test default.
- No real OpenRouter or Cloudflare calls are required for automated tests; use
  deterministic fetch fixtures.

## 1. Unit-test detector registry and mappings

Run focused detector tests:

```bash
pnpm --filter @next-wiki/web test -- src/server/ai/model-detector.test.ts
```

Expected:

- Existing OpenRouter embedding detection tests still pass.
- New registry tests reject unknown detector sources.
- New OpenRouter detector tests preserve namespace filtering and capability
  mapping.
- New Cloudflare detector tests map model search plus schema fixtures into
  normalized capabilities.
- Cloudflare per-model schema failure returns a partial model and warning
  instead of failing the whole list.

## 2. Validate model sync service behavior

Run AI admin service tests:

```bash
pnpm --filter @next-wiki/web test -- src/server/services/ai-admin*.test.ts
```

Expected:

- `POST /api/ai/providers/{id}/model-syncs` creates or resumes a `model_sync`
  action for detector-backed sync.
- Successful sync records added, updated, unavailable, skipped, and partial
  counts.
- Missing Cloudflare account ID or token fails before any network call.
- AI-disabled mode prevents detector network calls.
- Detector-owned metadata updates existing non-manual models.
- Manually added models and manual capability overrides are preserved.

## 3. Validate admin route contracts

Run route tests:

```bash
pnpm --filter @next-wiki/web test -- app/api/ai/ai-admin-routes.test.ts
```

Expected:

- Provider create/update accepts Cloudflare detector config and write-only
  credentials.
- Route responses do not contain Cloudflare or OpenRouter tokens.
- Non-admin contexts receive forbidden responses for detector config and sync.
- Model sync route returns action status for detector-backed runs.

## 4. Validate UI workflow

Run the admin AI Playwright coverage:

```bash
pnpm --filter @next-wiki/web test:e2e -- e2e/admin-ai*.spec.ts
```

Expected:

- Admin can configure detector settings without exposing stored secrets.
- Admin can start a model sync and see action progress/result counts.
- Model catalog shows detector provenance and partial status.
- Manual capability override remains active after sync.
- Browser refresh/back/forward keeps the canonical admin AI route stable.

## 5. Full verification before merge

Run:

```bash
pnpm lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web test:e2e -- e2e/admin-ai*.spec.ts
```

Expected:

- Lint and typecheck pass.
- AI admin and detector tests pass without real provider credentials.
- No test output or logged error contains detector API tokens.
- Existing OpenRouter regression coverage remains green.
