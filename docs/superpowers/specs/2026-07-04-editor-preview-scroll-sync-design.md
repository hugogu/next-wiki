# Editor/Preview Scroll Sync & Line Wrap Toggle

Status: Approved for planning
Date: 2026-07-04
Component: `apps/web/src/components/editor/SplitMarkdownEditor.tsx`

## Problem

`SplitMarkdownEditor` shows a CodeMirror source pane and a rendered-HTML
preview pane side by side. The two panes are kept "in sync" by matching
scroll **percentage** (`scrollTop / (scrollHeight - clientHeight)`), one
direction only (editor scroll drives preview scroll; the reverse has no
listener at all). Because the source markdown and the rendered HTML have
different total heights (headings, code blocks, tables, images all expand
differently than their source lines), percentage matching drifts the two
panes out of alignment as the user scrolls — halfway through the source is
not the same content as halfway through the rendered output.

Separately, the editor never enabled CodeMirror's line-wrapping extension,
so long lines require horizontal scrolling within the pane. This needs to
become a persisted, user-toggleable setting.

## Goals

1. Scroll the source and preview panes so the same *content position* stays
   aligned, in both directions (editor → preview and preview → editor).
2. Add a toolbar toggle for soft line-wrapping in the editor pane, default
   on, persisted across sessions.
3. Add a toolbar toggle to turn scroll sync off entirely, default on,
   persisted across sessions, independent of the wrap toggle.

## Non-goals

- Pixel-perfect alignment. Content-position alignment via line-number
  anchors is a large accuracy improvement over percentage matching, not a
  guarantee of exact registration (rendered block heights still vary
  within the interval between two anchors).
- Changing the `/api/preview` response contract. All position data is
  carried as HTML attributes in the existing `{ html: string }` payload.
- Virtualizing the preview pane's DOM. Out of scope; not needed to solve
  the alignment problem.

## Design

### 1. Source-line anchors in rendered HTML

`apps/web/src/server/pipeline/index.ts` runs a unified.js pipeline:

```
remarkParse → remarkMath → remarkGfm → remarkRehype → rehypeSanitize
  → setImageLoading → rehypeKatex → wrapCodeBlocks → rehypeHighlight
  → rehypeStringify
```

`remark-rehype` already preserves each mdast node's `position` on the
resulting hast node (no `passThrough` option needed) — it's just never
serialized into the output HTML. Add a new plugin, `addLineAnchors`,
immediately after `remarkRehype` and before `rehypeSanitize`:

- Visit every hast element node.
- If `node.tagName` is in a fixed block-level set —
  `h1 h2 h3 h4 h5 h6 p li blockquote pre tr hr table` — and the node has
  `position`, set `node.properties['data-line'] = node.position.start.line`
  (1-indexed, matching both mdast and CodeMirror's `doc.lineAt().number`).
- Order matters: this must run before `wrapCodeBlocks`, which rebuilds the
  `<pre>` element's parent chain. `wrapCodeBlocks` shallow-copies the
  original node's `properties` onto the (now-nested) `pre`, so a
  `data-line` set beforehand survives, just one level deeper inside the
  new wrapper `<div>`.

Update `sanitizeSchema` in the same file to whitelist the attribute once,
for every tag, instead of per-tag:

```ts
attributes: {
  ...defaultSchema.attributes,
  '*': [...(defaultSchema.attributes?.['*'] ?? []), 'data-line'],
  div: [...],
  span: [...],
  button: [...],
}
```

No change to `previewOutputSchema` or the `/api/preview` route — the line
numbers travel as ordinary HTML attributes inside the existing `html`
string.

### 2. Client-side anchor table (preview side)

In `SplitMarkdownEditor`, after the preview `html` renders into
`previewRef`, build a sorted anchor table:

```ts
type Anchor = { line: number; offsetTop: number };
```

- Query all `[data-line]` elements under `previewRef.current`.
- For each, compute `offsetTop` via
  `el.getBoundingClientRect().top - previewRef.current!.getBoundingClientRect().top + previewRef.current!.scrollTop`
  (robust to CSS positioning context, unlike raw `element.offsetTop`).
- Sort ascending by line; if two elements share a line, keep the first.
- Store in a ref (`anchorsRef`), not React state — rebuilding doesn't need
  to trigger a render.

Rebuild triggers:
- Whenever `html` changes (new content rendered).
- A `ResizeObserver` on the preview content wrapper, to catch async height
  changes after the initial render — confirmed necessary because
  `ContentRenderer` hydrates Mermaid diagrams via a dynamic `import('mermaid')`
  that resolves after mount and changes DOM height; code blocks hydrate
  synchronously but the observer covers both uniformly, plus late-loading
  images.

### 3. Bidirectional sync algorithm

Helper (pure, unit-testable, no DOM/CodeMirror dependency):

```ts
function interpolateOffsetForLine(anchors: Anchor[], line: number): number
function interpolateLineForOffset(anchors: Anchor[], offset: number): number
```

Both do the same thing in opposite directions: binary-search the sorted
`anchors` array for the bracketing pair and linearly interpolate. Clamp to
the first/last anchor when the target falls outside the table's range
(rather than extrapolating).

**Editor → preview:**
1. On the editor's `scrollDOM` `scroll` event, get
   `view.lineBlockAtHeight(scrollDOM.scrollTop)` → `{ from, top, height }`.
2. `line = doc.lineAt(from).number + (scrollDOM.scrollTop - top) / (height || 1)`.
3. `targetOffset = interpolateOffsetForLine(anchorsRef.current, line)`.
4. Set `previewRef.current.scrollTop = targetOffset` (clamped to
   `[0, scrollHeight - clientHeight]`).

**Preview → editor:**
1. On the preview `scroll` event,
   `line = interpolateLineForOffset(anchorsRef.current, previewRef.current.scrollTop)`.
2. `block = view.lineBlockAt(view.state.doc.line(Math.floor(line)).from)`.
3. `scrollDOM.scrollTop = block.top + (line - Math.floor(line)) * block.height`
   (clamped).

**Loop guard:** a single `isSyncingRef` boolean, set synchronously before
the programmatic `scrollTop` write, cleared on the next
`requestAnimationFrame`. Both scroll handlers bail out early if the flag is
set. This replaces the current `useState` + `setTimeout(50)` guard — a ref
avoids a React re-render on every scroll tick and avoids the arbitrary
50 ms window.

**Fallback:** if `anchorsRef.current` is empty (empty content, render
error, or pipeline produced no matching tags), both directions fall back
to the existing percentage-ratio calculation. This is strictly a safety
net — behavior in that case is no worse than today.

**Scroll-sync toggle:** a ref/state `scrollSyncEnabledRef`; both scroll
handlers check it first and return immediately (no computation, no writes)
when sync is off. Default on.

### 4. Line-wrap toggle

- New `wrapCompartment = new Compartment()` alongside the existing
  `editableCompartment` / `themeCompartment`.
- Extensions array includes
  `wrapCompartment.of(wrapEnabled ? EditorView.lineWrapping : [])` at
  creation.
- Toggling dispatches
  `view.dispatch({ effects: wrapCompartment.reconfigure(next ? EditorView.lineWrapping : []) })`,
  then triggers an anchor-table rebuild (wrapping changes line heights,
  which changes the editor-side height math for the sync algorithm) and
  persists the new value.
- `wrapEnabled` state: lazy `useState` initializer reading
  `localStorage['next-wiki:editor:wrap']`, guarded by
  `typeof window === 'undefined'` (same pattern as
  `ThemeProvider.tsx`). Default `true` when nothing stored.

### 5. Scroll-sync toggle

- Same persistence pattern, key `next-wiki:editor:scrollSync`, default
  `true`.
- No CodeMirror compartment involved — purely gates the two scroll
  handlers as described above.

### 6. Toolbar

- `ToolbarButton` gets a new optional `active?: boolean` prop. When true,
  adds pressed styling (`bg-surface text-foreground` instead of the
  default muted/hover-only look) and sets `aria-pressed`.
- Two new icons in `apps/web/src/components/icons/index.tsx`, matching the
  existing `Icon` wrapper (24 viewBox, `stroke="currentColor"`, `20x20`
  rendered size): `WrapTextIcon`, `ScrollSyncIcon`.
- Both new buttons are placed at the far right of the toolbar, after the
  existing Undo/Redo pair, separated by the same `div` divider already
  used before Undo/Redo — grouping them as view-level options distinct
  from the text-insertion actions earlier in the bar.
- New i18n keys in `apps/web/src/i18n/locales/{en,zh}.ts`:
  `editor.toolbar.wrap`, `editor.toolbar.scrollSync`.

## Edge cases & error handling

| Case | Handling |
|---|---|
| Empty/failed preview render | Anchor table empty → fall back to ratio-based sync |
| Async height changes (Mermaid/images) | `ResizeObserver` on preview content wrapper rebuilds anchor table |
| Sync-loop feedback | Single `isSyncingRef`, cleared next animation frame |
| Scroll sync toggled off | Handlers short-circuit before any computation |
| Wrap toggled | Reconfigure compartment, then rebuild anchor table (line heights changed) |
| `localStorage` unavailable (private browsing) | Guarded by `typeof window` checks; falls back to in-memory default, no throw |

## Testing plan

- **Pipeline unit tests** (`apps/web/src/server/pipeline/*.test.ts`):
  markdown with heading/paragraph/list/code-block/table produces matching
  `data-line` attributes on the expected tags, and they survive
  `rehypeSanitize`.
- **Pure-function unit tests** for `interpolateOffsetForLine` /
  `interpolateLineForOffset`: empty table, single-anchor table, target
  before first anchor, target after last anchor, exact anchor match,
  interpolation between two anchors.
- **E2e** (Playwright, `apps/web/e2e/`): confirmed the suite exists
  (`pnpm test:e2e`) with an established pattern in `flows.spec.ts` —
  `login`/`registerReader` helpers, `.cm-content` locator to fill the
  editor, `page.getByRole('button', { name: ... })` for toolbar actions
  (accessible name comes from `ToolbarButton`'s `aria-label`, so the new
  wrap/scroll-sync buttons are addressable the same way). Add a new
  `apps/web/e2e/editor-toolbar.spec.ts` following that pattern, covering:
  wrap toggle changes wrapping and survives reload; scroll-sync toggle
  disables/re-enables cross-pane scrolling; smoke test that scrolling one
  pane moves the other pane's ratio into a sane range (not pixel-exact,
  to avoid a brittle test).
- `SplitMarkdownEditor` currently has no dedicated component test file;
  this work adds a first one (Vitest + Testing Library, colocated as
  `SplitMarkdownEditor.test.tsx`) covering the pure interpolation helpers'
  integration and the toggle buttons' active-state rendering.
