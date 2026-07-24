# Markdown `.md` Suffix Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `.md` URL suffix support to all reader pages (wiki, generated, raw, link, and translation) so they return the raw Markdown source with `Content-Type: text/markdown; charset=utf-8`.

**Architecture:**
- Expose `contentType` on `PublicPageResource` so the reader can distinguish markdown from non-markdown raw entries without a second round-trip.
- Add a shared server helper (`src/lib/markdown-export.ts`) that detects the `.md` suffix, resolves the effective markdown source (following link targets), and builds the HTTP response.
- Wire the helper into the two App Router reader pages: `app/(public)/[...path]/page.tsx` and `app/(user)/spaces/[space]/[[...path]]/page.tsx`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Zod, Vitest.

---

## Task 1: Expose `contentType` on `PublicPageResource`

**Files:**
- Modify: `packages/shared/src/pages.ts:158-206`
- Modify: `apps/web/src/server/services/public-content.ts:152-175` (`minimalDeletedPageResource`)
- Modify: `apps/web/src/server/services/public-content.ts:287-315` (`visiblePageResource` return object)

**Step 1: Add `contentType` to the shared schema.**

In `packages/shared/src/pages.ts`, add `contentType: mimeTypeSchema` inside `publicPageResourceSchema`, right after `contentSource`.

```ts
export const publicPageResourceSchema = z.object({
  id: z.string().uuid(),
  spaceSlug: z.string(),
  path: pathSchema,
  locale: z.string(),
  title: z.string(),
  kind: z.enum(['native', 'link']).optional(),
  linkTarget: z
    .object({ pageId: z.string().uuid(), path: z.string(), title: z.string() })
    .nullable()
    .optional(),
  // ... existing fields ...
  contentSource: z.string().optional(),
  contentType: mimeTypeSchema,                 // <-- add
  frontmatter: z.record(z.unknown()).nullable(),
  // ... rest ...
});
```

**Step 2: Populate `contentType` in `visiblePageResource`.**

The `current` revision row is already available. Add `contentType: current.contentType` to the returned object in `apps/web/src/server/services/public-content.ts` around line 287.

```ts
return {
  id: page.id,
  spaceSlug: space.slug,
  path: page.path,
  // ...
  contentSource: options.includeContent ? content : undefined,
  contentType: current.contentType,        // <-- add
  // ...
};
```

**Step 3: Populate `contentType` in `minimalDeletedPageResource`.**

Use the `initialRevision` already fetched:

```ts
return {
  // ...
  contentSource: undefined,
  contentType: initialRevision?.contentType ?? 'text/markdown',
  // ...
};
```

**Step 4: Verify no public-content regressions.**

Run:

```bash
pnpm --filter @next-wiki/web test src/server/services/public-content-read.test.ts
```

Expected: all tests pass.

**Step 5: Commit.**

```bash
git add packages/shared/src/pages.ts apps/web/src/server/services/public-content.ts
git commit -m "feat(shared): expose revision contentType on PublicPageResource"
```

---

## Task 2: Create the Markdown Export Helper

**Files:**
- Create: `apps/web/src/lib/markdown-export.ts`
- Test: `apps/web/src/lib/markdown-export.test.ts`

**Step 1: Write the helper.**

Create `apps/web/src/lib/markdown-export.ts`:

```ts
import { and, eq, isNull } from 'drizzle-orm';
import type { PublicPageResource } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as publicContent from '@/server/services/public-content';
import type { PermCtx } from '@/server/permissions';

export type MarkdownResult =
  | { kind: 'ok'; source: string; contentType: string }
  | { kind: 'not-supported' }
  | { kind: 'not-found' };

export function stripMarkdownSuffix(segments: string[]): { isMarkdown: boolean; segments: string[] } {
  if (segments.length === 0) return { isMarkdown: false, segments };
  const last = segments[segments.length - 1];
  if (!last || !last.endsWith('.md')) return { isMarkdown: false, segments };
  const stripped = last.slice(0, -3);
  if (stripped === '') return { isMarkdown: false, segments };
  return { isMarkdown: true, segments: [...segments.slice(0, -1), stripped] };
}

export function toMarkdownResponse(result: MarkdownResult): Response {
  if (result.kind === 'not-found') {
    return new Response('Not Found', { status: 404 });
  }
  if (result.kind === 'not-supported') {
    return new Response('Not Acceptable', { status: 406 });
  }
  return new Response(result.source, {
    headers: { 'Content-Type': `${result.contentType}; charset=utf-8` },
  });
}

function markdownFromContent(
  contentType: string | null | undefined,
  contentSource: string | null | undefined,
): MarkdownResult {
  if (contentType && contentType !== 'text/markdown') {
    return { kind: 'not-supported' };
  }
  return {
    kind: 'ok',
    source: contentSource ?? '',
    contentType: contentType ?? 'text/markdown',
  };
}

export async function resolveMarkdownSource(
  ctx: PermCtx,
  page: PublicPageResource,
): Promise<MarkdownResult> {
  if (page.kind === 'link' && page.linkTarget?.pageId) {
    const target = await publicContent.getPageById(ctx, page.linkTarget.pageId, []);
    if (target?.contentSource !== undefined) {
      return markdownFromContent(target.contentType, target.contentSource);
    }
    // The link page is visible but the generated target is not accessible through the
    // normal space permission check. Since the link page already renders the target
    // content, fall back to reading the target's published revision directly.
    return getLinkTargetMarkdownSource(page.linkTarget.pageId);
  }

  return markdownFromContent(page.contentType, page.contentSource);
}

async function getLinkTargetMarkdownSource(targetPageId: string): Promise<MarkdownResult> {
  const targetPage = await db.query.pages.findFirst({
    where: and(eq(schema.pages.id, targetPageId), isNull(schema.pages.deletedAt)),
  });
  if (!targetPage?.currentPublishedVersionId) return { kind: 'not-found' };

  const revision = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, targetPage.currentPublishedVersionId),
  });
  if (!revision) return { kind: 'not-found' };

  return markdownFromContent(revision.contentType, revision.contentSource ?? '');
}
```

**Step 2: Write unit tests for `stripMarkdownSuffix`.**

Create `apps/web/src/lib/markdown-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stripMarkdownSuffix } from './markdown-export';

describe('stripMarkdownSuffix', () => {
  it('detects and strips the .md suffix from the last segment', () => {
    const result = stripMarkdownSuffix(['docs', 'page.md']);
    expect(result.isMarkdown).toBe(true);
    expect(result.segments).toEqual(['docs', 'page']);
  });

  it('leaves non-.md segments unchanged', () => {
    const result = stripMarkdownSuffix(['docs', 'page']);
    expect(result.isMarkdown).toBe(false);
    expect(result.segments).toEqual(['docs', 'page']);
  });

  it('does not treat a bare ".md" segment as a markdown request', () => {
    const result = stripMarkdownSuffix(['docs', '.md']);
    expect(result.isMarkdown).toBe(false);
  });
});
```

**Step 3: Run the helper tests.**

```bash
pnpm --filter @next-wiki/web test src/lib/markdown-export.test.ts
```

Expected: `stripMarkdownSuffix` tests pass.

**Step 4: Commit.**

```bash
git add apps/web/src/lib/markdown-export.ts apps/web/src/lib/markdown-export.test.ts
git commit -m "feat(web): add markdown export helper"
```

---

## Task 3: Wire `.md` Suffix into the Public Reader Page

**Files:**
- Modify: `apps/web/app/(public)/[...path]/page.tsx`

**Step 1: Add imports.**

At the top of the file, add:

```ts
import { resolveMarkdownSource, stripMarkdownSuffix, toMarkdownResponse } from '@/lib/markdown-export';
import * as publicContent from '@/server/services/public-content';
```

**Step 2: Add a markdown branch at the start of `PageRead`.**

Inside `PageRead`, after `const raw = await params;`, detect the suffix and, if present, return a markdown response.

```ts
export default async function PageRead({ params }: { params: PageParams }) {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const formatter = createAppFormatter(locale);
  const raw = await params;
  const actor = buildAnonymousCtx().actor;

  const markdownRequest = stripMarkdownSuffix(raw.path);
  if (markdownRequest.isMarkdown) {
    const resolved = await resolve({ actor }, markdownRequest.segments);
    if (resolved.kind !== 'original' && resolved.kind !== 'translation') {
      return toMarkdownResponse({ kind: 'not-found' });
    }
    const page = await publicContent.getPageById({ actor }, resolved.page.pageId, []);
    if (!page) return toMarkdownResponse({ kind: 'not-found' });
    return toMarkdownResponse(await resolveMarkdownSource({ actor }, page));
  }

  // ... existing HTML reader flow continues ...
}
```

Keep the existing `const resolved = await resolve({ actor }, raw.path);` and HTML rendering below unchanged.

**Step 3: Add a test for the markdown branch.**

In `apps/web/app/(public)/[...path]/page.test.tsx`, mock the new dependencies and assert a `Response` is returned.

```ts
vi.mock('@/lib/markdown-export', () => ({
  stripMarkdownSuffix: vi.fn((segments: string[]) =>
    segments[segments.length - 1]?.endsWith('.md')
      ? { isMarkdown: true, segments: [...segments.slice(0, -1), segments[segments.length - 1]!.slice(0, -3)] }
      : { isMarkdown: false, segments }
  ),
  resolveMarkdownSource: vi.fn(async () => ({ kind: 'ok', source: '# Hello', contentType: 'text/markdown' })),
  toMarkdownResponse: vi.fn((result: { kind: 'ok'; source: string; contentType: string }) =>
    new Response(result.source, { headers: { 'Content-Type': result.contentType } })
  ),
}));

vi.mock('@/server/services/public-content', () => ({
  getPageById: vi.fn(async () => ({
    pageId: 'page-1',
    contentType: 'text/markdown',
    contentSource: '# Hello',
    kind: 'native',
  })),
}));
```

Then add a test:

```ts
it('returns a markdown Response for .md paths', async () => {
  const response = await PageRead({ params: Promise.resolve({ path: ['hello.md'] }), searchParams: Promise.resolve({}) });
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).headers.get('Content-Type')).toBe('text/markdown');
  expect(await (response as Response).text()).toBe('# Hello');
});
```

**Step 4: Run the page test.**

```bash
pnpm --filter @next-wiki/web test app/\(public\)/\[...path\]/page.test.tsx
```

Expected: existing tests still pass and the new markdown test passes.

**Step 5: Commit.**

```bash
git add apps/web/app/\(public\)/\[...path\]/page.tsx apps/web/app/\(public\)/\[...path\]/page.test.tsx
git commit -m "feat(web): support .md suffix on public reader pages"
```

---

## Task 4: Wire `.md` Suffix into the Spaces Reader Page

**Files:**
- Modify: `apps/web/app/(user)/spaces/[space]/[[...path]]/page.tsx`

**Step 1: Add imports.**

At the top of the file, add:

```ts
import { resolveMarkdownSource, stripMarkdownSuffix, toMarkdownResponse } from '@/lib/markdown-export';
```

`publicContent` is already imported.

**Step 2: Add a markdown branch at the start of `SpaceReaderPage`.**

After `const path = segments.join('/');`, detect the suffix and return a markdown response.

```ts
export default async function SpaceReaderPage({ params }: { params: Params }) {
  const [resolved, actor, locale] = await Promise.all([params, getCurrentActor(), getStaticLocale()]);
  // ... existing validation ...

  const segments = resolved.path?.map(decodeURIComponent) ?? [];
  const markdownRequest = stripMarkdownSuffix(segments);

  if (markdownRequest.isMarkdown) {
    const lookupPath = markdownRequest.segments.join('/');
    const page = await publicContent.getPageByPath({ actor }, lookupPath, [], space);
    if (!page) return toMarkdownResponse({ kind: 'not-found' });
    return toMarkdownResponse(await resolveMarkdownSource({ actor }, page));
  }

  const path = segments.join('/');
  // ... existing HTML reader flow continues ...
}
```

Make sure the existing `if (!path) { ... }` empty-space view still runs only when `path` is empty after the markdown check.

**Step 3: Add a test for the markdown branch.**

In a new or existing test file, mock `publicContent.getPageByPath` and `markdown-export` helpers, then assert the response.

Create `apps/web/app/(user)/spaces/[space]/[[...path]]/page.test.tsx` with:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const publicContent = vi.hoisted(() => ({
  getPageByPath: vi.fn(),
}));
const markdownExport = vi.hoisted(() => ({
  stripMarkdownSuffix: vi.fn((segments: string[]) =>
    segments[segments.length - 1]?.endsWith('.md')
      ? { isMarkdown: true, segments: [...segments.slice(0, -1), segments[segments.length - 1]!.slice(0, -3)] }
      : { isMarkdown: false, segments }
  ),
  resolveMarkdownSource: vi.fn(async () => ({ kind: 'ok', source: '# Generated', contentType: 'text/markdown' })),
  toMarkdownResponse: vi.fn((result: { kind: 'ok'; source: string; contentType: string }) =>
    new Response(result.source, { headers: { 'Content-Type': result.contentType } })
  ),
}));

vi.mock('@/server/services/public-content', () => publicContent);
vi.mock('@/lib/markdown-export', () => markdownExport);
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('notFound'); }) }));
vi.mock('@/server/services/auth', () => ({ getCurrentActor: vi.fn(async () => ({ kind: 'user', userId: 'admin-1', role: 'admin' })) }));
vi.mock('@/server/services/writing-mode', () => ({ isLlmWikiMode: vi.fn(async () => true) }));
vi.mock('@/i18n/server', () => ({
  getStaticLocale: vi.fn(async () => 'en'),
  getDictionary: vi.fn(() => (key: string) => key),
}));
vi.mock('@/i18n/formatter', () => ({ createAppFormatter: vi.fn(() => ({ dateTime: () => 'date' })) }));
vi.mock('@/components/ui/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import SpaceReaderPage from './page';

describe('SpaceReaderPage .md export', () => {
  it('returns markdown for a generated page', async () => {
    publicContent.getPageByPath.mockResolvedValue({ pageId: 'p1', contentType: 'text/markdown', contentSource: '# Generated' });
    const response = await SpaceReaderPage({ params: Promise.resolve({ space: 'generated', path: ['guide.md'] }) });
    expect(response).toBeInstanceOf(Response);
    expect(await (response as Response).text()).toBe('# Generated');
  });
});
```

**Step 4: Run the page test.**

```bash
pnpm --filter @next-wiki/web test app/\(user\)/spaces/\[space\]/\[\[...path\]\]/page.test.tsx
```

Expected: the new test passes.

**Step 5: Commit.**

```bash
git add apps/web/app/\(user\)/spaces/\[space\]/\[\[...path\]\]/page.tsx apps/web/app/\(user\)/spaces/\[space\]/\[\[...path\]\]/page.test.tsx
git commit -m "feat(web): support .md suffix on spaces reader pages"
```

---

## Task 5: Add End-to-End Coverage for Raw Non-Markdown 406

**Files:**
- Modify: `apps/web/e2e/raw-content.spec.ts` or create `apps/web/e2e/markdown-suffix.spec.ts`

**Step 1: Add an E2E test.**

Use the existing E2E helpers to create a raw entry with a non-markdown content type (e.g., `image/png`) and assert that visiting `.../image.md` returns 406.

Example skeleton (adapt to existing helpers):

```ts
import { test, expect } from '@playwright/test';

test('raw non-markdown .md returns 406', async ({ page }) => {
  // setup: create a raw image entry via API or UI helpers
  await page.goto('/spaces/raw/my-image.md');
  const response = await page.waitForResponse((r) => r.url().endsWith('/spaces/raw/my-image.md'));
  expect(response.status()).toBe(406);
});
```

If E2E setup is complex, this test can be skipped in the initial PR and filed as a follow-up; the unit/integration tests in Tasks 2-4 cover the core logic.

**Step 2: Commit.**

```bash
git add apps/web/e2e/markdown-suffix.spec.ts
git commit -m "test(e2e): add .md suffix smoke tests"
```

---

## Task 6: Run Full Verification

**Step 1: Lint and typecheck.**

```bash
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
```

Expected: no errors, no warnings.

**Step 2: Run the affected test suites.**

```bash
pnpm --filter @next-wiki/web test src/lib/markdown-export.test.ts
pnpm --filter @next-wiki/web test src/server/services/public-content-read.test.ts
pnpm --filter @next-wiki/web test app/\(public\)/\[...path\]/page.test.tsx
pnpm --filter @next-wiki/web test app/\(user\)/spaces/\[space\]/\[\[...path\]\]/page.test.tsx
```

Expected: all pass.

**Step 3: Build the web app.**

```bash
pnpm --filter @next-wiki/web build
```

Expected: build succeeds.

---

## Notes and Edge Cases

- **Translations:** The public reader already resolves `/zh/page.md` to the translation page; `publicContent.getPageById` returns the translation's `contentSource`.
- **Link pages:** The helper first tries `publicContent.getPageById` on the target (works for admin callers in spaces). If the target is not accessible, it falls back to a direct DB read of the target's published revision, so public link pages still serve their target's markdown.
- **Raw non-markdown:** Returns 406 Not Acceptable per the user's choice.
- **Caching:** Public reader pages remain `force-static` with `revalidate = 300`; the `.md` Response is computed on the first request and cached like the HTML page. Spaces reader is `force-dynamic`, so `.md` is always fresh.
- **Status codes:** 404 for not found/unauthorized, 406 for unsupported content type, 200 for markdown responses.
