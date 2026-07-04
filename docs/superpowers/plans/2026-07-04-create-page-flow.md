# Create-Page Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/new`'s single-step "fill everything, submit once" form with a popup that collects only title+path, creates a real draft page immediately via the (now content-optional) public API, then hands off entirely to the existing `/edit/{path}` route — so AI features work from the first keystroke and there is exactly one editor implementation.

**Architecture:** One Zod schema relaxation (`contentSource` becomes optional, defaulting to `''`) makes the public `POST /api/v1/pages` capable of creating an empty draft. `PagePropertiesPanel` splits into a presentational `PagePropertiesFields` (reused) and a `ModalDialog`-based wrapper; a new `NewPageDialog` reuses the same fields component for the pre-creation step. `CreatePageForm` shrinks to "show dialog, create, redirect" — no editor-mounting logic. Three existing e2e specs that assume the old one-step flow are rewritten; one new e2e spec covers the dialog itself.

**Tech Stack:** Next.js 16 App Router, Zod, react-hook-form, Drizzle/Postgres, Vitest, Playwright, `next-openapi-gen`.

**Spec:** `docs/superpowers/specs/2026-07-04-create-page-flow-design.md`

**Notes on deviations/additions found during planning (not in the spec, discovered while tracing exact call sites):**
- The spec's testing plan named only `flows.spec.ts` as needing updates. Tracing every e2e spec that touches `/new` found two more: `content-images.spec.ts` (uploads an image via the old properties-drawer-then-save-once flow) and `editor-toolbar.spec.ts` (this session's own scroll-sync/wrap-toggle tests, which fill `.cm-content` directly on `/new` — that selector won't exist there anymore). Both are covered as their own tasks below.
- `NewPageDialog`'s input schema is added to `packages/shared` as `publicPageCreateInputSchema.pick({ path: true, title: true })` rather than a component-local Zod object, so path/title validation has one source of truth instead of being redeclared.
- `packages/shared` has no test runner configured at all (no vitest devDependency, no test script) — schema-level behavior is tested from `apps/web` instead (which already depends on `@next-wiki/shared` and has vitest configured), consistent with there being no existing precedent for tests inside `packages/shared`.

---

### Task 1: Relax the public create-page schema

**Files:**
- Modify: `packages/shared/src/pages.ts:152-158`
- Test: `apps/web/src/server/services/pages.test.ts` (new `describe` block near the top)

- [ ] **Step 1: Write the failing test**

Add near the top of `apps/web/src/server/services/pages.test.ts`, after the existing imports (add `publicPageCreateInputSchema` to the `@next-wiki/shared` import — it's a new import in this file):

```ts
import { publicPageCreateInputSchema } from '@next-wiki/shared';
```

Then add this `describe` block before the existing `describe('pageService', ...)` (or wherever the file's main describe starts — place it as a top-level sibling):

```ts
describe('publicPageCreateInputSchema', () => {
  it('defaults contentSource to an empty string when omitted', () => {
    const result = publicPageCreateInputSchema.parse({ path: 'schema-test-a', title: 'A Title' });
    expect(result.contentSource).toBe('');
  });

  it('accepts an explicit empty contentSource', () => {
    const result = publicPageCreateInputSchema.parse({
      path: 'schema-test-b',
      title: 'A Title',
      contentSource: '',
    });
    expect(result.contentSource).toBe('');
  });

  it('still accepts non-empty contentSource unchanged', () => {
    const result = publicPageCreateInputSchema.parse({
      path: 'schema-test-c',
      title: 'A Title',
      contentSource: '# Hello',
    });
    expect(result.contentSource).toBe('# Hello');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run src/server/services/pages.test.ts -t publicPageCreateInputSchema`
Expected: FAIL on the first test (`defaults contentSource...`) — `ZodError: contentSource Required`, since the schema currently has `.min(1)` with no default.

- [ ] **Step 3: Relax the schema**

In `packages/shared/src/pages.ts`, change:

```ts
export const publicPageCreateInputSchema = z.object({
  path: pathSchema,
  locale: z.string().min(1).max(20).optional(),
  title: z.string().min(1).max(200),
  contentSource: z.string().min(1),
});
export type PublicPageCreateInput = z.infer<typeof publicPageCreateInputSchema>;
```

to:

```ts
export const publicPageCreateInputSchema = z.object({
  path: pathSchema,
  locale: z.string().min(1).max(20).optional(),
  title: z.string().min(1).max(200),
  contentSource: z.string().default(''),
});
export type PublicPageCreateInput = z.infer<typeof publicPageCreateInputSchema>;

export const newPageDialogInputSchema = publicPageCreateInputSchema.pick({ path: true, title: true });
export type NewPageDialogInput = z.infer<typeof newPageDialogInputSchema>;
```

(`newPageDialogInputSchema` is used by `NewPageDialog` in Task 7 — adding it now keeps this one-line-diff task focused on the schema file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run src/server/services/pages.test.ts -t publicPageCreateInputSchema`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck the shared package**

Run: `cd packages/shared && pnpm typecheck`
Expected: no errors (the new export is additive; `PublicPageCreateInput`'s inferred type is unchanged in shape, only `contentSource`'s requiredness at the Zod-parse boundary changes, which doesn't affect the inferred TS type since `.default()` still yields `string`, not `string | undefined`, in the *output* type — confirm this compiles cleanly across `apps/web`, which is Step 6).

- [ ] **Step 6: Typecheck apps/web**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/pages.ts apps/web/src/server/services/pages.test.ts
git commit -m "feat(pages): make contentSource optional on public page creation"
```

---

### Task 2: Service-level test for empty-content creation

**Files:**
- Test: `apps/web/src/server/services/pages.test.ts` (new test case inside the existing `create` describe block)

- [ ] **Step 1: Write the failing test**

Find the existing `describe('create', ...)` block (the one already testing `pageService.create()` — it creates a user via the file's `createUser` helper and calls `pageService.create(ctx, {...})`). Add a sibling test:

```ts
  it('creates a page with empty content', async () => {
    const editor = await createUser('editor-empty-content@example.com', 'editor');
    const ctx = buildUserCtx(editor.id, 'editor');

    const result = await pageService.create(ctx, {
      path: 'empty-content-test',
      title: 'Empty Draft',
      contentSource: '',
    });

    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, result.versionId),
    });
    expect(revision?.contentSource).toBe('');
    expect(revision?.status).toBe('draft');
  });
```

- [ ] **Step 2: Run the test to verify it fails or passes**

Run: `cd apps/web && pnpm exec vitest run src/server/services/pages.test.ts -t "creates a page with empty content"`
Expected: Likely PASSES already — `pageService.create()` was confirmed during design research to have no content-length check of its own (the `min(1)` lived only in the Zod schema layer). This step exists to *prove* that, not to drive new implementation. If it somehow fails, that reveals an undocumented service-layer check that needs its own fix — stop and investigate rather than patching around it.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/server/services/pages.test.ts
git commit -m "test(pages): cover pageService.create with empty content"
```

---

### Task 3: Update OpenAPI docs for the relaxed schema

**Files:**
- Modify: `apps/web/app/api/v1/pages/route.ts:26-37`
- Generated (commit the diff): `apps/web/public/openapi.json`

- [ ] **Step 1: Update the route's JSDoc description**

In `apps/web/app/api/v1/pages/route.ts`, change:

```ts
/**
 * Create a page and its first draft revision.
 *
 * @openapi
 * @summary Create public wiki page
 * @description Creates a page through the stable Public Wiki Content API.
 * @tag Pages
 * @auth bearer
 * @queryParams PublicPageIncludeQuery
 * @body PublicPageCreateInput
 * @response 201:PublicPageResource
 */
```

to:

```ts
/**
 * Create a page and its first draft revision.
 *
 * @openapi
 * @summary Create public wiki page
 * @description Creates a page through the stable Public Wiki Content API.
 *   `contentSource` is optional and defaults to an empty string, creating
 *   an empty draft that can be filled in with a subsequent draft-create
 *   call.
 * @tag Pages
 * @auth bearer
 * @queryParams PublicPageIncludeQuery
 * @body PublicPageCreateInput
 * @response 201:PublicPageResource
 */
```

- [ ] **Step 2: Regenerate the OpenAPI document**

Run: `cd apps/web && pnpm openapi:generate`
Expected: completes without error; `apps/web/public/openapi.json` is rewritten. Diff it (`git diff apps/web/public/openapi.json`) and confirm the only substantive change is `contentSource` no longer being in `PublicPageCreateInput`'s `required` array (plus the updated description text) — not an unrelated wholesale reordering that would make review hard. If the diff is much larger than expected, stop and check `finalize-openapi.mjs` didn't pick up unrelated drift before committing.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/v1/pages/route.ts apps/web/public/openapi.json
git commit -m "docs(api): document optional contentSource on page creation"
```

---

### Task 4: i18n key for the dialog's submit button

**Files:**
- Modify: `apps/web/src/i18n/locales/en.ts` (near `page.create.*`, around line 97-101)
- Modify: `apps/web/src/i18n/locales/zh.ts` (same location)

- [ ] **Step 1: Add the key to both locales**

`en.ts`, after `'page.create.error.generic': 'Failed to create page.',`:

```ts
  'page.create.submit': 'Create',
```

`zh.ts`, after `'page.create.error.generic': '创建页面失败。',`:

```ts
  'page.create.submit': '创建',
```

(`page.create.metadataTitle` — `'New page'` / `'新建页面'` — already exists and is reused as the dialog's title; no new key needed for that.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors (this repo's i18n typing fails to compile if `en.ts`/`zh.ts` keys drift, per existing convention — confirms both stay in sync).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/i18n/locales/en.ts apps/web/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add new-page dialog submit label"
```

---

### Task 5: Extract `PagePropertiesFields`

**Files:**
- Create: `apps/web/src/components/editor/PagePropertiesFields.tsx`
- Modify: `apps/web/src/components/editor/PagePropertiesPanel.tsx` (rewritten in Task 6, not this one — this task only adds the new file)

- [ ] **Step 1: Create the fields-only component**

```tsx
import { Input } from '@/components/ui/Input';
import { useTranslation } from '@/i18n/client';

export function PagePropertiesFields({
  title,
  onTitleChange,
  titleError,
  path,
  onPathChange,
  pathError,
  pathReadOnly = false,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  path: string;
  onPathChange: (value: string) => void;
  pathError?: string;
  pathReadOnly?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-md">
      <div>
        <label htmlFor="prop-title" className="block text-sm font-medium mb-xs">
          {t('editor.properties.fields.titleLabel')}
        </label>
        <Input
          id="prop-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t('editor.properties.fields.titlePlaceholder')}
          aria-label={t('editor.properties.fields.titleLabel')}
        />
        {titleError && <p className="text-danger text-xs mt-xs">{titleError}</p>}
      </div>

      <div>
        <label htmlFor="prop-path" className="block text-sm font-medium mb-xs">
          {t('editor.properties.fields.pathLabel')}
        </label>
        <Input
          id="prop-path"
          value={path}
          onChange={(e) => !pathReadOnly && onPathChange(e.target.value)}
          placeholder={t('editor.properties.fields.pathPlaceholder')}
          aria-label={t('editor.properties.fields.pathLabel')}
          disabled={pathReadOnly}
        />
        {pathError && <p className="text-danger text-xs mt-xs">{pathError}</p>}
        {!pathReadOnly && (
          <p className="text-xs text-muted mt-xs">
            {t('editor.properties.fields.pathHint', { example: 'docs/getting-started' })}
          </p>
        )}
      </div>
    </div>
  );
}
```

This is the exact inner content of today's `PagePropertiesPanel.tsx:24-60`, minus the outer drawer `<div>` and the `<h2>` heading (the heading moves to `ModalDialog`'s own `title` prop in Task 6/7, so it isn't duplicated).

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors (file is unused so far — wired up in Task 6).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/editor/PagePropertiesFields.tsx
git commit -m "feat(editor): extract PagePropertiesFields from PagePropertiesPanel"
```

---

### Task 6: Convert `PagePropertiesPanel` to a modal popup

**Files:**
- Modify: `apps/web/src/components/editor/PagePropertiesPanel.tsx` (full rewrite)
- Modify: `apps/web/src/components/pages/EditPageForm.tsx:144-153`

- [ ] **Step 1: Rewrite `PagePropertiesPanel.tsx`**

```tsx
import { ModalDialog } from '@/components/ui/ModalDialog';
import { useTranslation } from '@/i18n/client';
import { PagePropertiesFields } from './PagePropertiesFields';

export function PagePropertiesPanel({
  title,
  onTitleChange,
  titleError,
  path,
  onPathChange,
  pathError,
  pathReadOnly = false,
  onClose,
}: {
  title: string;
  onTitleChange: (value: string) => void;
  titleError?: string;
  path: string;
  onPathChange: (value: string) => void;
  pathError?: string;
  pathReadOnly?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ModalDialog title={t('editor.properties.title')} onClose={onClose} maxWidth="max-w-md">
      <PagePropertiesFields
        title={title}
        onTitleChange={onTitleChange}
        titleError={titleError}
        path={path}
        onPathChange={onPathChange}
        pathError={pathError}
        pathReadOnly={pathReadOnly}
      />
    </ModalDialog>
  );
}
```

- [ ] **Step 2: Wire `onClose` at the `EditPageForm` call site**

In `apps/web/src/components/pages/EditPageForm.tsx`, the existing call (around line 144-153):

```tsx
        {propertiesOpen && (
          <PagePropertiesPanel
            title={title}
            onTitleChange={(v) => setValue('title', v, { shouldValidate: true })}
            titleError={errors.title?.message}
            path={newPath}
            onPathChange={setNewPath}
            pathError={newPath !== path && !updatePagePropertiesSchema.safeParse({ path: newPath }).success ? t('page.edit.validation.invalidPath') : undefined}
          />
        )}
```

add `onClose={toggleProperties}`:

```tsx
        {propertiesOpen && (
          <PagePropertiesPanel
            title={title}
            onTitleChange={(v) => setValue('title', v, { shouldValidate: true })}
            titleError={errors.title?.message}
            path={newPath}
            onPathChange={setNewPath}
            pathError={newPath !== path && !updatePagePropertiesSchema.safeParse({ path: newPath }).success ? t('page.edit.validation.invalidPath') : undefined}
            onClose={toggleProperties}
          />
        )}
```

(`toggleProperties` already exists in this component and is already in scope — it's the same callback the toolbar button uses to open the panel, so closing just flips it back.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev server (see Task 13 for the full checklist — this is a spot-check now to catch obvious breakage early). Log in, open an existing page's edit view, click "Page properties" in the toolbar: confirm it now opens as a centered popup (not a right-side drawer), Esc and clicking the backdrop both close it, and editing title/path still works exactly as before.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/editor/PagePropertiesPanel.tsx apps/web/src/components/pages/EditPageForm.tsx
git commit -m "feat(editor): render page properties as a modal instead of a drawer"
```

---

### Task 7: Create `NewPageDialog`

**Files:**
- Create: `apps/web/src/components/pages/NewPageDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { newPageDialogInputSchema, type NewPageDialogInput, type PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiPost, type ApiError } from '@/lib/api/client';
import { getPublicApiPagesUrl } from '@/lib/path';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { PagePropertiesFields } from '@/components/editor/PagePropertiesFields';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export function NewPageDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NewPageDialogInput>({
    resolver: zodResolver(newPageDialogInputSchema),
    defaultValues: { path: '', title: '' },
  });

  const title = watch('title');
  const path = watch('path');

  const onSubmit = useCallback(
    async (data: NewPageDialogInput) => {
      setServerError(null);
      setIsSaving(true);
      try {
        const result = await apiPost<NewPageDialogInput, PublicPageResource>(getPublicApiPagesUrl(), data);
        onCreated(result.path);
      } catch (err) {
        const error = err as ApiError;
        if (error.code === 'CONFLICT') {
          setServerError(t('page.create.error.pathExists'));
        } else if (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
          setServerError(t('page.create.error.forbidden'));
        } else {
          setServerError(error.message || t('page.create.error.generic'));
        }
      } finally {
        setIsSaving(false);
      }
    },
    [onCreated, t],
  );

  return (
    <ModalDialog title={t('page.create.metadataTitle')} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-md">
        {serverError && <Alert>{serverError}</Alert>}
        <PagePropertiesFields
          title={title}
          onTitleChange={(v) => setValue('title', v, { shouldValidate: true })}
          titleError={errors.title?.message}
          path={path}
          onPathChange={(v) => setValue('path', v, { shouldValidate: true })}
          pathError={errors.path?.message}
        />
        <div className="flex justify-end gap-sm">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {t('page.create.submit')}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors (component created but not yet wired into `/new` — that's Task 8).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/pages/NewPageDialog.tsx
git commit -m "feat(pages): add NewPageDialog for popup-first page creation"
```

---

### Task 8: Rewrite `CreatePageForm` as a thin bootstrap

**Files:**
- Modify: `apps/web/src/components/pages/CreatePageForm.tsx` (full rewrite, ~126 lines → ~20)

- [ ] **Step 1: Rewrite the component**

```tsx
'use client';

import { useCallback } from 'react';
import { useHistory } from '@/lib/history';
import { getEditHref } from '@/lib/path';
import { NewPageDialog } from './NewPageDialog';

export function CreatePageForm() {
  const { goBack } = useHistory();

  const handleClose = useCallback(() => {
    goBack('/');
  }, [goBack]);

  const handleCreated = useCallback((path: string) => {
    window.location.href = getEditHref(path);
  }, []);

  return <NewPageDialog onClose={handleClose} onCreated={handleCreated} />;
}
```

This drops the `SplitMarkdownEditor` render, the `react-hook-form`/`publicPageCreateInputSchema` usage (moved into `NewPageDialog`), the `EditorContext`/`setEditor()` wiring (there's no toolbar to drive while only the dialog is showing — `Header.tsx` already renders its default chrome when `useEditor()` is `null`), and the old one-shot submit handler.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: no errors. If `PagePropertiesPanel` or other now-unused imports linger from the old file, remove them — there should be none left importing `SplitMarkdownEditor`, `zodResolver`, `publicPageCreateInputSchema`, or `PagePropertiesPanel` in this file anymore.

- [ ] **Step 3: Lint**

Run: `cd apps/web && pnpm exec eslint src/components/pages/CreatePageForm.tsx`
Expected: no errors (catches any leftover unused imports from the rewrite).

- [ ] **Step 4: Manual verification**

Start the dev server. Log in as an editor/admin, visit `/new`: confirm the dialog appears immediately with no editor visible behind it. Submit with empty fields: confirm inline validation blocks it. Fill a valid title + unique path and submit: confirm it redirects to `/edit/{path}` and the real `SplitMarkdownEditor` loads there, with the AI toolbar buttons visible if AI is enabled in this environment (if not enabled, just confirm the editor loads normally — AI visibility isn't testable without an AI provider configured, and that's fine). Type some content and save: confirm the existing save flow (redirect to `/history/{path}`) still works. Check browser console for errors throughout.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/pages/CreatePageForm.tsx
git commit -m "feat(pages): make CreatePageForm a thin popup-then-redirect bootstrap"
```

---

### Task 9: Update `flows.spec.ts` for the two-phase flow

**Files:**
- Modify: `apps/web/e2e/flows.spec.ts`

- [ ] **Step 1: Replace the properties helpers with a `createPage` helper**

Remove `openProperties` and `fillProperties` (lines 26-34) entirely — replace with:

```ts
async function createPage(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
}
```

- [ ] **Step 2: Update the "editor drafts, publishes" test**

Replace:

```ts
    await login(page, editorEmail, 'Password123!');
    await page.goto('/new');
    await fillProperties(page, path, 'Publish Flow Test');
    await fillEditor(page, 'draft content');
    await savePage(page);
    await page.waitForURL(`/${path}`);
```

with:

```ts
    await login(page, editorEmail, 'Password123!');
    await createPage(page, path, 'Publish Flow Test');
    await fillEditor(page, 'draft content');
    await savePage(page);
    await page.waitForURL(`/history/${path}`);
```

(Saving content now always goes through `EditPageForm`'s existing mechanics, which redirect to `/history/{path}` — matching what this same test already expects later, at its *second* edit sequence around line 92-95. `publishPage(page)` right after this still works: it clicks the button whose accessible name contains "Publish" — Playwright's string `name` matcher is substring/case-insensitive by default — which exists on the history page per revision and redirects to `/{path}` on success, so the subsequent `This page is a draft` assertion still runs on the right page.)

- [ ] **Step 3: Update the "role change is effective mid-session" test**

Replace:

```ts
    await targetPage.goto('/new');
    await expect(targetPage.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(targetPage.locator('.cm-content')).toBeVisible();
```

with:

```ts
    await targetPage.goto('/new');
    await expect(targetPage.getByLabel('Title')).toBeVisible();
```

(There's no editor or Save button on `/new` anymore — the new-page dialog's Title field becoming visible is what proves the role change took effect and access was granted, replacing the old assertion.)

- [ ] **Step 4: Run the updated spec**

Run: `cd apps/web && pnpm exec playwright test flows.spec.ts`
Expected: PASS (3 tests). If the Docker Postgres container isn't up, start it first (`docker compose up -d db` from the repo root) — see Task 13 for the full pre-flight checklist.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/flows.spec.ts
git commit -m "test(e2e): update flows.spec.ts for the two-phase create-page flow"
```

---

### Task 10: Update `content-images.spec.ts` for the two-phase flow

**Files:**
- Modify: `apps/web/e2e/content-images.spec.ts`

- [ ] **Step 1: Replace the inline properties-opening with a `createPage` helper**

Add the same helper used in Task 9 (this file doesn't share code with `flows.spec.ts` — each e2e file is self-contained per existing convention, so duplicate the small helper rather than introducing a shared module for one function):

```ts
async function createPage(page: Page, path: string, title: string) {
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
}
```

- [ ] **Step 2: Update the test body**

Replace:

```ts
    await page.goto('/new');
    await page.getByRole('button', { name: 'Page properties' }).click();
    await page.getByLabel('Path').fill(path);
    await page.getByLabel('Title').fill('Image Flow');
    // Close properties dialog if it is modal; fall back to pressing Escape.
    await page.keyboard.press('Escape').catch(() => undefined);

    await page.locator('.cm-content').click();
    await uploadViaToolbar(page);

    // The asset reference is inserted at the cursor and rendered in the preview.
    await expect(page.locator('.cm-content')).toContainText('/api/assets/', { timeout: 15_000 });
    await expect(page.locator('img[src*="/api/assets/"]')).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Publish' }).click();
```

with:

```ts
    await createPage(page, path, 'Image Flow');

    await page.locator('.cm-content').click();
    await uploadViaToolbar(page);

    // The asset reference is inserted at the cursor and rendered in the preview.
    await expect(page.locator('.cm-content')).toContainText('/api/assets/', { timeout: 15_000 });
    await expect(page.locator('img[src*="/api/assets/"]')).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL(`/history/${path}`);
    await page.getByRole('button', { name: 'Publish' }).click();
```

(The old comment about "if it is modal" is gone since there's no drawer/modal-toggle step in this flow anymore — `createPage` handles the properties step entirely before any editor content exists. The added `waitForURL` makes the save→publish sequencing explicit instead of relying on implicit timing, matching how `flows.spec.ts` already had to be adjusted in Task 9.)

- [ ] **Step 3: Run the updated spec**

Run: `cd apps/web && pnpm exec playwright test content-images.spec.ts`
Expected: PASS (2 tests — the image-upload flow and the unrelated 404-asset test, which doesn't touch `/new` and needs no changes).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/content-images.spec.ts
git commit -m "test(e2e): update content-images.spec.ts for the two-phase create-page flow"
```

---

### Task 11: Update `editor-toolbar.spec.ts` for the two-phase flow

**Files:**
- Modify: `apps/web/e2e/editor-toolbar.spec.ts`

- [ ] **Step 1: Add a `createPage` helper with a unique path per call**

Add after the existing `login` helper:

```ts
let pageCounter = 0;

async function createPage(page: Page, title: string): Promise<string> {
  const path = `editor-toolbar-${Date.now()}-${pageCounter++}`;
  await page.goto('/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Path').fill(path);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(`/edit/${path}`);
  return path;
}
```

(A per-test unique path is needed here — unlike `flows.spec.ts`/`content-images.spec.ts`, this file runs the *same* `/new`-touching setup three times, so a timestamp alone risks collisions if two tests start within the same millisecond.)

- [ ] **Step 2: Replace all three `login` + `goto('/new')` pairs**

In each of the three tests, replace:

```ts
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');
```

with:

```ts
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createPage(page, 'Editor Toolbar Test');
```

(All three tests already proceed to fill `.cm-content` or interact with the toolbar immediately after — since `createPage` now lands them on `/edit/{path}` with a real, empty page already loaded, no other changes are needed in the test bodies.)

- [ ] **Step 3: Run the updated spec**

Run: `cd apps/web && pnpm exec playwright test editor-toolbar.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/editor-toolbar.spec.ts
git commit -m "test(e2e): update editor-toolbar.spec.ts for the two-phase create-page flow"
```

---

### Task 12: New e2e coverage for `NewPageDialog` itself

**Files:**
- Create: `apps/web/e2e/new-page-dialog.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
}

test.describe('new page dialog', () => {
  test('shows immediately with no editor behind it, and blocks empty submission', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.locator('.cm-content')).toHaveCount(0);

    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByLabel('Title')).toBeVisible(); // still on /new, not navigated away
  });

  test('creating with a valid title and path redirects into the editor', async ({ page }) => {
    const path = `new-page-dialog-${Date.now()}`;
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    await page.getByLabel('Title').fill('New Page Dialog Test');
    await page.getByLabel('Path').fill(path);
    await page.getByRole('button', { name: 'Create' }).click();

    await page.waitForURL(`/edit/${path}`);
    await expect(page.locator('.cm-content')).toBeVisible();
  });

  test('creating at an existing path shows a conflict error and keeps the dialog open', async ({ page }) => {
    const path = `new-page-dialog-conflict-${Date.now()}`;
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/new');
    await page.getByLabel('Title').fill('First');
    await page.getByLabel('Path').fill(path);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(`/edit/${path}`);

    await page.goto('/new');
    await page.getByLabel('Title').fill('Second');
    await page.getByLabel('Path').fill(path);
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText('A page with this path already exists.')).toBeVisible();
    await expect(page.getByLabel('Title')).toBeVisible(); // dialog still open, not navigated away
  });

  test('closing the dialog without submitting creates nothing', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    await page.keyboard.press('Escape');
    await page.waitForURL('/');
  });
});
```

- [ ] **Step 2: Run the new spec**

Run: `cd apps/web && pnpm exec playwright test new-page-dialog.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/new-page-dialog.spec.ts
git commit -m "test(e2e): cover the new-page dialog's validation, conflict, and cancel behavior"
```

---

### Task 13: Full verification pass

- [ ] **Step 1: Run the full unit test suite**

Run: `cd apps/web && pnpm exec vitest run`
Expected: all pass, no regressions.

- [ ] **Step 2: Typecheck and lint the whole app**

Run: `cd apps/web && pnpm exec tsc --noEmit && pnpm exec eslint .`
Expected: no errors, no new warnings. (The pre-existing `Cannot find module 'diff'` error in `public-content.ts:786` is unrelated and pre-dates this work — confirm it's still the *only* typecheck error, not a new one.)

- [ ] **Step 3: Run the full e2e suite for everything this change touches**

Run: `cd apps/web && pnpm exec playwright test flows.spec.ts content-images.spec.ts editor-toolbar.spec.ts new-page-dialog.spec.ts`
Expected: all pass.

Before running the *entire* e2e suite (all ~35 spec files) in one shot, check for and stop any other dev server started via the preview tool or manual `pnpm dev` in this session — a leftover one competing for CPU previously produced ~34 unrelated timeout failures that had nothing to do with actual code correctness (see prior session notes). If you do run the complete suite, treat widespread unrelated timeouts as an environment/resource signal, not a regression, and re-run in isolation to confirm before concluding anything is broken.

- [ ] **Step 4: Manual browser pass**

Start the dev server. As an editor/admin:
- Visit `/new`: dialog shows immediately, no editor visible behind it.
- Try submitting empty: blocked with inline validation.
- Create a page with a valid title/path: redirected to `/edit/{path}`; confirm the toolbar (including the wrap/scroll-sync toggles from earlier this session, and the AI buttons if AI is enabled in this environment) all render normally.
- Type content, save, publish: confirm the existing save→history→publish flow still works end to end.
- On an *existing* page's edit view, click "Page properties" in the toolbar: confirm it's now a centered popup, not a drawer; Esc/backdrop-click closes it without navigating away.
- Check the browser console for errors throughout.

- [ ] **Step 5: Final commit if anything was fixed during verification**

```bash
git add -A
git commit -m "fix: address issues found in create-page-flow verification pass"
```

(Skip this commit if verification found nothing to fix.)
