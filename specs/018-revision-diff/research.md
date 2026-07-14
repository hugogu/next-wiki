# Research: Client-Side Revision Diff

## Decision 1: Use the existing `diff` package's token comparator in the browser

**Decision**: Reuse the existing `diff` 9.x dependency. Convert both revision sources into original line tokens and use `diffArrays` with a comparator. In normal mode, compare exact line text. In Ignore whitespace mode, compare a whitespace-stripped comparison key while always retaining the original text and line number for display.

**Rationale**: The package is already part of the application and supports a browser-side Myers-style line comparison. Token comparison preserves the two original sources, allowing the UI to show original line numbers and content even when cosmetic whitespace changes are ignored. It also avoids adding a large editor/runtime dependency for a focused read-only feature.

**Alternatives considered**:

- `diffLines` with its whitespace option: rejected because its option only handles leading/trailing whitespace and does not meet the requirement to exclude all whitespace-only differences.
- A new Monaco-style diff editor: rejected because it adds a substantial UI runtime and styling surface while not solving rendered preview or URL-state requirements.
- A custom diff implementation: rejected because the existing well-tested dependency covers the needed primitive without a new maintenance burden.
- A Web Worker from the first release: rejected because the representative 5,000-line performance target must first be measured. A worker can be added later behind the same pure-model contract if profiling demonstrates a need.

## Decision 2: Build an aligned line model before rendering

**Decision**: Transform comparison output into a pure `AlignedRow` sequence. Adjacent removed and added runs are paired as changed rows; surplus lines remain one-sided added or removed rows. The same model computes hunk boundaries, collapsed separators, changed source-line ranges, and Full context.

**Rationale**: A normalized model lets both source columns share equal-height rows, preserves source line numbers, and makes context controls deterministic. It also provides one source of truth for source rendering, preview highlights, scroll anchors, tests, and summary states.

**Alternatives considered**:

- Render the library's patch text directly: rejected because unified patch text lacks the paired rows, independent line numbers, and hunk controls required by the UI.
- Diff rendered HTML: rejected because revision identity is raw source, HTML is derived, and HTML diffs cannot correctly express source line numbers or whitespace-only source changes.

## Decision 3: Reuse stored revision HTML for preview

**Decision**: Load each authorized revision through the existing page revision read and give the client both its source and its already stored sanitized HTML. Preview mounts that HTML with `ContentRenderer`; it never sends raw Markdown to a new preview endpoint or copies the server rendering pipeline into the browser.

**Rationale**: Every revision already records the output of the registered rendering pipeline. Reusing it keeps history preview faithful to the normal reader and preserves handling for code, Mermaid, math, assets, sanitization, and renderer islands. It also keeps the requested comparison behavior client side without creating server-side Diff work.

**Alternatives considered**:

- A new browser Markdown renderer: rejected because it would duplicate the server pipeline, diverge in sanitization and special-block behavior, and enlarge the browser bundle.
- The editor preview endpoint: rejected because it is server rendering and is unrelated to immutable revision comparison.
- The existing server Diff endpoint: rejected by the feature boundary and because its unified patch cannot support the required presentation.

## Decision 4: Make the revision-pair route canonical and retain the single revision route

**Decision**: Keep history and comparison on the dynamic history route. The history selector sorts its two choices and navigates to `/history/<path>?compare=<a>..<b>`. The existing revision route continues to render a single version; a legacy pair address redirects to the canonical history URL.

**Rationale**: The architecture mandate requires a revision-pair URL and every reader-reachable state must be restorable. Next.js cannot host sibling dynamic segments for a single revision and a pair at the same position. One parser keeps existing single-revision bookmarks working while supplying exactly one comparison address.

**Alternatives considered**:

- A separate comparison page: rejected because it splits revision selection from inspection and requires a redundant navigation step.
- A second dynamic route such as `[pair]`: rejected because it conflicts with the existing `[n]` segment.
- A separate verb-style `/diff` path: rejected by the RESTful URL mandate and because it would create a competing entry point.

## Decision 5: Use URL-derived options and anchor-based bidirectional scrolling

**Decision**: Treat route/search parameters as the source of truth for view mode, whitespace behavior, context, and linked scrolling. Source panes scroll using aligned-row anchors. Preview panes use the existing `data-line` block anchors, monotonic interpolation helpers, and echo suppression; a `ResizeObserver` refreshes maps after asynchronous image or diagram sizing.

**Rationale**: URL state satisfies refresh, share, and browser-navigation requirements. Row anchors stay accurate when a source hunk has one-sided lines; preview anchors align the corresponding rendered document blocks more closely than scroll percentage and have an existing editor precedent.

**Alternatives considered**:

- Component state or persisted local preferences for view options: rejected because it loses shareable state and violates the URL-state mandate.
- Scroll percentage mapping: rejected because additions, removals, images, and diagrams produce unequal pane heights and drift.
- Always-linked scrolling with no off switch: rejected because readers need to inspect one side independently.

## Decision 6: Preview highlights blocks, not invalid line fragments

**Decision**: Preview renders complete documents and marks rendered blocks whose `data-line` anchor intersects a changed source range. It does not trim Markdown by line. The context control limits source hunks; in preview it limits the changed/nearby block navigation and highlighting rather than making malformed partial documents. A frontmatter-only change is represented by an explicit source/metadata change notice because frontmatter has no rendered block anchor.

**Rationale**: Lists, tables, fenced code, and nested blocks cannot safely be cut at arbitrary source lines. The existing pipeline strips valid frontmatter before it assigns rendered `data-line` anchors, so blindly using source lines would mislabel preview content without a per-revision frontmatter offset.

**Alternatives considered**:

- Render only line-sliced preview context: rejected because it can create invalid or misleading document structure.
- Claim character-level preview highlighting: rejected because stored HTML carries block line anchors, not a one-to-one mapping for every source token.

## Resolved Planning Questions

| Question | Resolution |
|---|---|
| Is a database migration or persisted comparison entity needed? | No. Revision data is immutable input and all comparison state is transient URL/client state. |
| Does the browser call the server Diff route? | No. It must not call or change that route. |
| How are two revision bodies obtained? | The pair route reuses two existing permission-checked revision reads; only browser-side code computes and presents their differences. |
| Does preview re-render Markdown in the browser? | No. It reuses each revision's stored rendered HTML through the shared renderer. |
| What does Ignore whitespace mean? | Whitespace-only differences are excluded using whitespace-stripped comparison keys; displayed source stays unchanged. |
| How is a reversed pair link handled? | It redirects to the ascending version pair, preserving valid option parameters. |
| Is Full context a stored preference? | No. It is a URL option for the active comparison only. |

## Local Sources Consulted

- `apps/web/package.json` — existing `diff` dependency.
- `apps/web/app/(public)/history/[...path]/page.tsx` — history route and visible revision list.
- `apps/web/app/(public)/revisions/[n]/[...path]/page.tsx` — existing single-revision route.
- `apps/web/src/server/services/pages.ts` — permission-safe `getHistory` and `getRevision` reads.
- `apps/web/src/server/services/public-content.ts` and `app/api/v1/.../diff/route.ts` — legacy server Diff operation that this feature does not use.
- `apps/web/src/server/pipeline/index.ts` — stored HTML and `data-line` anchors.
- `apps/web/src/components/renderer/ContentRenderer.tsx` — shared stored-HTML renderer.
- `apps/web/src/components/editor/scrollSync.ts` — anchor mapping and interpolation primitives.
- `docs/architecture/mandates.md` and `docs/architecture/frontend-data-flow.md` — routing and URL-state constraints.
