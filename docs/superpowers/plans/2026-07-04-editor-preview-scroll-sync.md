# Editor/Preview Scroll Sync & Wrap Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace percentage-based editor/preview scroll sync with bidirectional, source-line-anchored sync, and add persisted toolbar toggles for line wrapping and scroll sync itself.

**Architecture:** The rendering pipeline stamps `data-line` (source line number) onto block-level elements in the preview HTML. The client builds a sorted line→offsetTop table from those attributes and uses it (plus CodeMirror's `lineBlockAt`/`lineBlockAtHeight`) to convert between "editor scroll position" and "preview scroll position" by interpolating on content position instead of raw percentage. Two new toolbar toggles (wrap, scroll-sync) are persisted to `localStorage` following the existing `ThemeProvider` pattern.

**Tech Stack:** unified/remark/rehype (existing pipeline), CodeMirror 6 (existing editor), React 19, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-04-editor-preview-scroll-sync-design.md`

**Note on deviations from the spec during planning:**
- The spec's testing section originally said "if Playwright coverage exists" — confirmed it does (`apps/web/e2e/`), and the plan below targets a new concrete file, `apps/web/e2e/editor-toolbar.spec.ts`.
- The spec proposed a `SplitMarkdownEditor.test.tsx` using "Vitest + Testing Library." This repo has no `@testing-library/react` dependency and its one existing interactive-component test (`Pagination.test.tsx`) uses `renderToStaticMarkup` under `// @vitest-environment node` — it does not mount effects/refs/DOM APIs. Introducing `@testing-library/react` + `jsdom` (which also doesn't reliably support CodeMirror's `contenteditable` measurement APIs) is out of scope for this feature. This plan instead: (a) extracts all the pure, non-DOM math into `scrollSync.ts` and unit-tests it directly (matches existing pipeline test style), and (b) covers the actual interactive behavior (toggle buttons, cross-pane scrolling) with the Playwright e2e suite, which already drives a real browser against this exact component. No new test infrastructure is introduced.
- The spec's wrap-toggle handler mentioned it "triggers an anchor-table rebuild" after reconfiguring. On closer inspection this isn't needed: the preview-side anchor table (line → offsetTop) doesn't depend on editor line-wrapping at all, and the editor-side height lookups (`lineBlockAt`/`lineBlockAtHeight`) are always computed live from the current CodeMirror view state, never cached. The plan below omits that rebuild call.

---

### Task 1: Pure scroll-sync interpolation module

**Files:**
- Create: `apps/web/src/components/editor/scrollSync.ts`
- Test: `apps/web/src/components/editor/scrollSync.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/components/editor/scrollSync.test.ts
import { describe, it, expect } from 'vitest';
import { interpolateOffsetForLine, interpolateLineForOffset, type ScrollAnchor } from './scrollSync';

const anchors: ScrollAnchor[] = [
  { line: 1, offsetTop: 0 },
  { line: 5, offsetTop: 100 },
  { line: 10, offsetTop: 300 },
];

describe('interpolateOffsetForLine', () => {
  it('returns 0 for an empty table', () => {
    expect(interpolateOffsetForLine([], 5)).toBe(0);
  });

  it('clamps to the first anchor when the line is before the table', () => {
    expect(interpolateOffsetForLine(anchors, 0)).toBe(0);
  });

  it('clamps to the last anchor when the line is after the table', () => {
    expect(interpolateOffsetForLine(anchors, 999)).toBe(300);
  });

  it('returns an exact anchor offset for an exact line match', () => {
    expect(interpolateOffsetForLine(anchors, 5)).toBe(100);
  });

  it('interpolates linearly between two bracketing anchors', () => {
    // line 7.5 is halfway between anchor(5, 100) and anchor(10, 300)
    expect(interpolateOffsetForLine(anchors, 7.5)).toBeCloseTo(200);
  });

  it('handles a single-anchor table', () => {
    expect(interpolateOffsetForLine([{ line: 3, offsetTop: 42 }], 100)).toBe(42);
  });
});

describe('interpolateLineForOffset', () => {
  it('returns 1 for an empty table', () => {
    expect(interpolateLineForOffset([], 50)).toBe(1);
  });

  it('clamps to the first anchor when the offset is before the table', () => {
    expect(interpolateLineForOffset(anchors, -10)).toBe(1);
  });

  it('clamps to the last anchor when the offset is after the table', () => {
    expect(interpolateLineForOffset(anchors, 9999)).toBe(10);
  });

  it('returns an exact anchor line for an exact offset match', () => {
    expect(interpolateLineForOffset(anchors, 100)).toBe(5);
  });

  it('interpolates linearly between two bracketing anchors', () => {
    // offset 200 is halfway between anchor(5, 100) and anchor(10, 300)
    expect(interpolateLineForOffset(anchors, 200)).toBeCloseTo(7.5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @next-wiki/web exec vitest run src/components/editor/scrollSync.test.ts`
Expected: FAIL — `Cannot find module './scrollSync'`

- [ ] **Step 3: Implement `scrollSync.ts`**

```ts
// apps/web/src/components/editor/scrollSync.ts

/**
 * One point mapping a rendered preview element back to the source line it
 * came from. `offsetTop` is measured from the top of the preview's
 * scrollable content (see `buildAnchors`), not the viewport.
 */
export type ScrollAnchor = { line: number; offsetTop: number };

/**
 * Scan a rendered preview subtree for `[data-line]` elements (stamped by the
 * `addLineAnchors` rehype plugin — see server/pipeline/index.ts) and build a
 * sorted, deduplicated anchor table.
 *
 * `root` must be the scrollable element itself: offsets are computed
 * relative to its content box plus its current `scrollTop`, so the result is
 * stable across the element's own scroll position at build time.
 */
export function buildAnchors(root: HTMLElement): ScrollAnchor[] {
  const rootRect = root.getBoundingClientRect();
  const elements = root.querySelectorAll<HTMLElement>('[data-line]');
  const anchors: ScrollAnchor[] = [];
  let lastLine = Number.NaN;
  for (const el of elements) {
    const line = Number(el.dataset.line);
    if (!Number.isFinite(line) || line === lastLine) continue;
    const rect = el.getBoundingClientRect();
    anchors.push({ line, offsetTop: rect.top - rootRect.top + root.scrollTop });
    lastLine = line;
  }
  return anchors;
}

/**
 * Given a sorted-by-line anchor table, find the offset that corresponds to a
 * (possibly fractional) source line, interpolating between the two
 * bracketing anchors. Clamps to the table's range instead of extrapolating
 * past it.
 */
export function interpolateOffsetForLine(anchors: ScrollAnchor[], line: number): number {
  if (anchors.length === 0) return 0;
  if (line <= anchors[0].line) return anchors[0].offsetTop;
  const last = anchors[anchors.length - 1];
  if (line >= last.line) return last.offsetTop;

  let lo = 0;
  let hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].line <= line) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo];
  const b = anchors[hi];
  const span = b.line - a.line || 1;
  return a.offsetTop + ((line - a.line) / span) * (b.offsetTop - a.offsetTop);
}

/**
 * Inverse of `interpolateOffsetForLine`: given a scroll offset, find the
 * corresponding (possibly fractional) source line number (1-indexed, to
 * match both mdast/rehype positions and CodeMirror's `doc.lineAt().number`).
 */
export function interpolateLineForOffset(anchors: ScrollAnchor[], offset: number): number {
  if (anchors.length === 0) return 1;
  if (offset <= anchors[0].offsetTop) return anchors[0].line;
  const last = anchors[anchors.length - 1];
  if (offset >= last.offsetTop) return last.line;

  let lo = 0;
  let hi = anchors.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].offsetTop <= offset) lo = mid;
    else hi = mid;
  }
  const a = anchors[lo];
  const b = anchors[hi];
  const span = b.offsetTop - a.offsetTop || 1;
  return a.line + ((offset - a.offsetTop) / span) * (b.line - a.line);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @next-wiki/web exec vitest run src/components/editor/scrollSync.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/editor/scrollSync.ts apps/web/src/components/editor/scrollSync.test.ts
git commit -m "feat(editor): add pure line/offset interpolation for scroll sync"
```

---

### Task 2: Source-line anchors in the rendering pipeline

**Files:**
- Modify: `apps/web/src/server/pipeline/index.ts`
- Test: `apps/web/src/server/pipeline/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe('renderMarkdown', ...)` block in `pipeline.test.ts`:

```ts
  it('marks block-level elements with their 1-indexed source line', () => {
    const { html } = renderMarkdown('# Title\n\nSome text\n\n- item one\n- item two');
    expect(html).toContain('<h1 data-line="1">Title</h1>');
    expect(html).toContain('<p data-line="3">Some text</p>');
    expect(html).toContain('<li data-line="5">item one</li>');
    expect(html).toContain('<li data-line="6">item two</li>');
  });

  it('keeps a data-line attribute on the wrapped <pre> for code blocks', () => {
    const { html } = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<div data-code-block="">');
    expect(html).toMatch(/<pre[^>]*\bdata-line="1"[^>]*>/);
  });

  it('marks table rows with their source line', () => {
    const { html } = renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
    expect(html).toMatch(/<tr[^>]*\bdata-line="1"[^>]*>/); // header row
    expect(html).toMatch(/<tr[^>]*\bdata-line="3"[^>]*>/); // data row
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @next-wiki/web exec vitest run src/server/pipeline/pipeline.test.ts`
Expected: FAIL — the three new assertions don't find `data-line` anywhere in the output.

- [ ] **Step 3: Add the `addLineAnchors` plugin and whitelist the attribute**

In `apps/web/src/server/pipeline/index.ts`, add a tag set and the plugin near the other tree-visitor helpers (after `isElement`, before `setImageLoading`):

```ts
const LINE_ANCHOR_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'blockquote', 'pre', 'tr', 'hr', 'table',
]);

/**
 * Stamp block-level elements with the 1-indexed source line they came from,
 * so the editor's split-pane preview can scroll-sync by content position
 * instead of raw scroll percentage. Must run before `wrapCodeBlocks` (which
 * rebuilds the parent chain around `<pre>`, but shallow-copies its
 * `properties` onto the nested node, so an attribute set here survives) and
 * before `rehypeSanitize` (which strips unlisted attributes — see
 * `sanitizeSchema` below).
 */
function addLineAnchors(tree: Root) {
  visit(tree, 'element', (node) => {
    if (!isElement(node) || !LINE_ANCHOR_TAGS.has(node.tagName)) return;
    const line = node.position?.start.line;
    if (line === undefined) return;
    node.properties = { ...node.properties, 'data-line': line };
  });
}
```

Update `sanitizeSchema` to whitelist `data-line` for every tag via the wildcard key, instead of adding it per-tag:

```ts
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'data-line'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className', 'data-code-block', 'data-mermaid-block'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    button: [...(defaultSchema.attributes?.button ?? []), 'className'],
  },
};
```

Wire the plugin into the pipeline in `renderMarkdown`, immediately after `remarkRehype` and before `rehypeSanitize`:

```ts
  const html = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(() => addLineAnchors)
    .use(rehypeSanitize, sanitizeSchema)
    .use(() => setImageLoading)
    .use(rehypeKatex, { strict: 'ignore' })
    .use(() => wrapCodeBlocks)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .processSync(source)
    .toString();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @next-wiki/web exec vitest run src/server/pipeline/pipeline.test.ts`
Expected: PASS (all tests, including the 3 new ones and every pre-existing one — confirms the wildcard whitelist and new plugin didn't regress code block / mermaid / math / table rendering)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/pipeline/index.ts apps/web/src/server/pipeline/pipeline.test.ts
git commit -m "feat(pipeline): stamp block-level elements with source line numbers"
```

---

### Task 3: New toolbar icons

**Files:**
- Modify: `apps/web/src/components/icons/index.tsx`

- [ ] **Step 1: Add `WrapTextIcon` and `ScrollSyncIcon`**

Append, following the exact pattern of the existing icons in this file (24 viewBox via the shared `Icon` wrapper, no test — icons aren't unit-tested anywhere in this codebase):

```tsx
export function WrapTextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M3 12h15a3 3 0 0 1 0 6h-4" />
      <polyline points="10 16 6 18 10 20" />
      <line x1="3" y1="18" x2="6" y2="18" />
    </Icon>
  );
}

export function ScrollSyncIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <line x1="3" y1="6" x2="10" y2="6" />
      <line x1="14" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="10" y2="18" />
      <line x1="14" y1="18" x2="21" y2="18" />
      <polyline points="9 9 12 6 15 9" />
      <polyline points="9 15 12 18 15 15" />
    </Icon>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @next-wiki/web exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/icons/index.tsx
git commit -m "feat(icons): add wrap-text and scroll-sync icons"
```

---

### Task 4: i18n keys

**Files:**
- Modify: `apps/web/src/i18n/locales/en.ts`
- Modify: `apps/web/src/i18n/locales/zh.ts`

- [ ] **Step 1: Add the two new keys next to the other `editor.toolbar.*` keys**

`en.ts` (after `'editor.toolbar.image': 'Insert image',`):

```ts
  'editor.toolbar.wrap': 'Toggle line wrap',
  'editor.toolbar.scrollSync': 'Toggle scroll sync',
```

`zh.ts` (after `'editor.toolbar.image': '插入图片',`):

```ts
  'editor.toolbar.wrap': '切换自动换行',
  'editor.toolbar.scrollSync': '切换滚动同步',
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @next-wiki/web exec tsc --noEmit`
Expected: no errors (this repo's i18n typing fails to compile if `en.ts`/`zh.ts` keys drift — confirms both files stay in sync).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/i18n/locales/en.ts apps/web/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add wrap and scroll-sync toolbar labels"
```

---

### Task 5: `ToolbarButton` active/pressed state

**Files:**
- Modify: `apps/web/src/components/editor/SplitMarkdownEditor.tsx:477-500`

- [ ] **Step 1: Add an optional `active` prop with pressed styling**

Replace the `ToolbarButton` function at the bottom of the file:

```tsx
function ToolbarButton({
  onClick,
  label,
  children,
  disabled = false,
  active,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        active ? 'bg-surface text-foreground' : 'text-muted hover:text-foreground hover:bg-surface'
      }`}
    >
      {children}
    </button>
  );
}
```

Note: when `active` is left `undefined` (every existing caller), React omits `aria-pressed` from the DOM entirely and the class expression falls through to the original `text-muted hover:...` branch — this is a no-op change for every button except the two new ones added in Task 7/8.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @next-wiki/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/editor/SplitMarkdownEditor.tsx
git commit -m "feat(editor): add pressed/active styling to ToolbarButton"
```

---

### Task 6: Persisted boolean preference helper

**Files:**
- Modify: `apps/web/src/components/editor/SplitMarkdownEditor.tsx`

- [ ] **Step 1: Add storage keys and read/write helpers**

Near the top of the file, after the `themeCompartment` declaration, add:

```ts
const wrapCompartment = new Compartment();

const WRAP_STORAGE_KEY = 'next-wiki:editor:wrap';
const SCROLL_SYNC_STORAGE_KEY = 'next-wiki:editor:scrollSync';

function readBooleanPreference(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  return stored === null ? fallback : stored === 'true';
}

function writeBooleanPreference(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, String(value));
}
```

This follows the same SSR-guard pattern as `getStoredTheme`/`setStoredTheme` in `apps/web/src/components/theme/ThemeProvider.tsx:26-34`, generalized to a key parameter since we now have two independent boolean preferences.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @next-wiki/web exec tsc --noEmit`
Expected: no errors (helpers unused so far — wired up in Tasks 7-8).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/editor/SplitMarkdownEditor.tsx
git commit -m "feat(editor): add localStorage helpers for editor preferences"
```

---

### Task 7: Line-wrap toggle

**Files:**
- Modify: `apps/web/src/components/editor/SplitMarkdownEditor.tsx`

- [ ] **Step 1: Add `wrapEnabled` state**

Inside the component, next to the other `useState` declarations:

```tsx
  const [wrapEnabled, setWrapEnabled] = useState(() => readBooleanPreference(WRAP_STORAGE_KEY, true));
```

- [ ] **Step 2: Include the wrap compartment when the view is created**

In the mount effect (the one with the `// eslint-disable-next-line react-hooks/exhaustive-deps` comment, currently building `extensions: [...]`), add one line — the effect already intentionally runs once on mount, so reading `wrapEnabled` here captures its resolved initial value:

```tsx
        extensions: [
          history(),
          markdown({ codeLanguages: [] }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          editableCompartment.of(EditorView.editable.of(!disabledRef.current)),
          themeCompartment.of(codeMirrorTheme()),
          wrapCompartment.of(wrapEnabled ? EditorView.lineWrapping : []),
        ],
```

- [ ] **Step 3: Add the toggle handler**

Next to the other `useCallback` handlers (e.g. near `handleUndo`/`handleRedo`):

```tsx
  const toggleWrap = useCallback(() => {
    setWrapEnabled((prev) => {
      const next = !prev;
      writeBooleanPreference(WRAP_STORAGE_KEY, next);
      viewRef.current?.dispatch({
        effects: wrapCompartment.reconfigure(next ? EditorView.lineWrapping : []),
      });
      return next;
    });
  }, []);
```

- [ ] **Step 4: Add the toolbar button**

After the existing Undo/Redo buttons (before the `{uploading && ...}` block), add a divider and the button:

```tsx
        <div className="w-px h-5 bg-border mx-xs" />
        <ToolbarButton onClick={toggleWrap} label={t('editor.toolbar.wrap')} active={wrapEnabled}>
          <WrapTextIcon />
        </ToolbarButton>
```

Add `WrapTextIcon` to the icon import list at the top of the file.

- [ ] **Step 5: Manual verification**

Start the dev server, open a page's editor, confirm the wrap button shows pressed (default on), type a long line and confirm it wraps, click the button and confirm it un-wraps (horizontal scroll appears), reload the page and confirm the toggled-off state persisted.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/editor/SplitMarkdownEditor.tsx
git commit -m "feat(editor): add persisted line-wrap toggle to toolbar"
```

---

### Task 8: Scroll-sync toggle + bidirectional line-anchored sync

**Files:**
- Modify: `apps/web/src/components/editor/SplitMarkdownEditor.tsx`

This is the core of the feature: replacing the one-directional percentage sync
with the bidirectional, anchor-based algorithm from the spec, gated by a
persisted on/off toggle.

- [ ] **Step 1: Remove the old sync state and handler**

Delete the `syncing` state (`const [syncing, setSyncing] = useState(false);`)
and the entire existing `handleScroll` + its wiring `useEffect`
(`SplitMarkdownEditor.tsx:301-317` in the pre-existing file).

- [ ] **Step 2: Add the new refs, state, and imports**

```tsx
import { buildAnchors, interpolateOffsetForLine, interpolateLineForOffset, type ScrollAnchor } from './scrollSync';
```

Inside the component:

```tsx
  const anchorsRef = useRef<ScrollAnchor[]>([]);
  const isSyncingRef = useRef(false);
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(() =>
    readBooleanPreference(SCROLL_SYNC_STORAGE_KEY, true),
  );
```

- [ ] **Step 3: Add a `data-testid` on the preview pane for e2e targeting**

In the JSX, on the existing preview `<div ref={previewRef} ...>`:

```tsx
        <div
          ref={previewRef}
          data-testid="editor-preview-pane"
          className="w-1/2 h-full overflow-auto p-md bg-background"
        >
```

- [ ] **Step 4: Build/rebuild the anchor table**

```tsx
  const rebuildAnchors = useCallback(() => {
    const preview = previewRef.current;
    if (!preview) return;
    anchorsRef.current = buildAnchors(preview);
  }, []);

  useEffect(() => {
    rebuildAnchors();
  }, [html, rebuildAnchors]);

  useEffect(() => {
    const target = previewRef.current?.firstElementChild;
    if (!target) return;
    const observer = new ResizeObserver(() => rebuildAnchors());
    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

`previewRef.current.firstElementChild` is `ContentRenderer`'s own root `<div>`
(see `apps/web/src/components/renderer/ContentRenderer.tsx`) — observing it
catches height changes from async Mermaid rendering, KaTeX, or image loads,
in addition to the `html`-triggered rebuild above.

- [ ] **Step 5: Bidirectional scroll handlers**

```tsx
  const handleEditorScroll = useCallback(() => {
    if (isSyncingRef.current || !scrollSyncEnabled) return;
    const view = viewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    const scrollDOM = view.scrollDOM;
    const anchors = anchorsRef.current;
    let targetOffset: number;

    if (anchors.length > 0) {
      const block = view.lineBlockAtHeight(scrollDOM.scrollTop);
      const fraction = block.height > 0 ? (scrollDOM.scrollTop - block.top) / block.height : 0;
      const line = view.state.doc.lineAt(block.from).number + fraction;
      targetOffset = interpolateOffsetForLine(anchors, line);
    } else {
      const ratio = scrollDOM.scrollTop / (scrollDOM.scrollHeight - scrollDOM.clientHeight || 1);
      targetOffset = ratio * (preview.scrollHeight - preview.clientHeight);
    }

    isSyncingRef.current = true;
    preview.scrollTop = Math.max(0, Math.min(targetOffset, preview.scrollHeight - preview.clientHeight));
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [scrollSyncEnabled]);

  const handlePreviewScroll = useCallback(() => {
    if (isSyncingRef.current || !scrollSyncEnabled) return;
    const view = viewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    const scrollDOM = view.scrollDOM;
    const anchors = anchorsRef.current;
    let targetScrollTop: number;

    if (anchors.length > 0) {
      const line = interpolateLineForOffset(anchors, preview.scrollTop);
      const lineNumber = Math.min(Math.max(Math.floor(line), 1), view.state.doc.lines);
      const block = view.lineBlockAt(view.state.doc.line(lineNumber).from);
      targetScrollTop = block.top + (line - lineNumber) * block.height;
    } else {
      const ratio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
      targetScrollTop = ratio * (scrollDOM.scrollHeight - scrollDOM.clientHeight);
    }

    isSyncingRef.current = true;
    scrollDOM.scrollTop = Math.max(0, Math.min(targetScrollTop, scrollDOM.scrollHeight - scrollDOM.clientHeight));
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  }, [scrollSyncEnabled]);

  useEffect(() => {
    const scrollDOM = viewRef.current?.scrollDOM;
    const preview = previewRef.current;
    if (!scrollDOM || !preview) return;
    scrollDOM.addEventListener('scroll', handleEditorScroll);
    preview.addEventListener('scroll', handlePreviewScroll);
    return () => {
      scrollDOM.removeEventListener('scroll', handleEditorScroll);
      preview.removeEventListener('scroll', handlePreviewScroll);
    };
  }, [handleEditorScroll, handlePreviewScroll]);
```

This entirely replaces the old `handleScroll` + its `useEffect`.

- [ ] **Step 6: Toggle handler and toolbar button**

```tsx
  const toggleScrollSync = useCallback(() => {
    setScrollSyncEnabled((prev) => {
      const next = !prev;
      writeBooleanPreference(SCROLL_SYNC_STORAGE_KEY, next);
      return next;
    });
  }, []);
```

Toolbar, right after the wrap button added in Task 7:

```tsx
        <ToolbarButton
          onClick={toggleScrollSync}
          label={t('editor.toolbar.scrollSync')}
          active={scrollSyncEnabled}
        >
          <ScrollSyncIcon />
        </ToolbarButton>
```

Add `ScrollSyncIcon` to the icon import list.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @next-wiki/web exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Start the dev server (`pnpm dev`), open a page's editor with enough content
to scroll (e.g. paste ~100 short paragraphs), then:
- Scroll the editor pane; confirm the preview pane scrolls so the same
  paragraph is visible in both (not a raw percentage match — check near the
  top, middle, and bottom of the document, since headings/code blocks in
  your test content should visibly diverge from a naive percentage match).
- Scroll the preview pane; confirm the editor follows the same way.
- Click the scroll-sync toggle off; confirm scrolling either pane no longer
  moves the other. Toggle back on; confirm sync resumes.
- Reload the page; confirm the scroll-sync toggle's on/off state persisted.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/editor/SplitMarkdownEditor.tsx
git commit -m "feat(editor): bidirectional line-anchored scroll sync with on/off toggle"
```

---

### Task 9: E2e coverage

**Files:**
- Create: `apps/web/e2e/editor-toolbar.spec.ts`

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

function longMarkdown(paragraphs: number) {
  return Array.from({ length: paragraphs }, (_, i) => `## Section ${i}\n\nParagraph number ${i}.`).join(
    '\n\n',
  );
}

test.describe('editor toolbar toggles', () => {
  test('wrap toggle flips state and persists across reload', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');

    const wrapButton = page.getByRole('button', { name: 'Toggle line wrap' });
    await expect(wrapButton).toHaveAttribute('aria-pressed', 'true');

    await wrapButton.click();
    await expect(wrapButton).toHaveAttribute('aria-pressed', 'false');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Toggle line wrap' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('scroll sync toggle disables and re-enables cross-pane scrolling', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');
    await page.locator('.cm-content').fill(longMarkdown(150));

    const editorScroller = page.locator('.cm-scroller');
    const preview = page.getByTestId('editor-preview-pane');

    await page.waitForFunction(() => {
      const scroller = document.querySelector('.cm-scroller');
      return !!scroller && scroller.scrollHeight > scroller.clientHeight * 1.5;
    });

    await page.getByRole('button', { name: 'Toggle scroll sync' }).click();
    const before = await preview.evaluate((el) => el.scrollTop);
    await editorScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await page.waitForTimeout(200);
    expect(await preview.evaluate((el) => el.scrollTop)).toBe(before);

    await page.getByRole('button', { name: 'Toggle scroll sync' }).click();
    await editorScroller.evaluate((el) => {
      el.scrollTop = 0;
    });
    await editorScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight / 2;
    });
    await page.waitForTimeout(200);
    expect(await preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  });

  test('scrolling the editor moves the preview to a roughly matching position', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto('/new');
    await page.locator('.cm-content').fill(longMarkdown(150));

    const editorScroller = page.locator('.cm-scroller');
    const preview = page.getByTestId('editor-preview-pane');

    await page.waitForFunction(() => {
      const scroller = document.querySelector('.cm-scroller');
      return !!scroller && scroller.scrollHeight > scroller.clientHeight * 1.5;
    });

    await editorScroller.evaluate((el) => {
      el.scrollTop = el.scrollHeight * 0.5;
    });
    await page.waitForTimeout(200);

    const ratio = await preview.evaluate((el) => el.scrollTop / (el.scrollHeight - el.clientHeight));
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.7);
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm --filter @next-wiki/web test:e2e editor-toolbar`
Expected: PASS (3 tests). If the dev/e2e server isn't already running, follow
the existing e2e setup in `apps/web/test/run-e2e-server.mjs` — same
prerequisite as running any other spec in `apps/web/e2e/`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/editor-toolbar.spec.ts
git commit -m "test(e2e): cover wrap and scroll-sync toolbar toggles"
```

---

### Task 10: Full verification pass

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm --filter @next-wiki/web test`
Expected: all pass, no regressions in unrelated pipeline/editor tests.

- [ ] **Step 2: Typecheck and lint the whole app**

Run: `pnpm --filter @next-wiki/web typecheck && pnpm --filter @next-wiki/web lint`
Expected: no errors, no new warnings.

- [ ] **Step 3: Manual browser pass**

Start the dev server, open an existing long page in edit mode (or paste
enough content to scroll), and re-confirm the three behaviors from Tasks
7-8's manual verification steps together in one pass: wrap toggle, scroll
sync toggle, and bidirectional content-position scrolling. Check the browser
console for new errors/warnings introduced by this change.

- [ ] **Step 4: Final commit if anything was fixed during verification**

```bash
git add -A
git commit -m "fix(editor): address issues found in verification pass"
```

(Skip this commit if verification found nothing to fix.)
