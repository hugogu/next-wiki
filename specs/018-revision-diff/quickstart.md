# Quickstart: Validate Client-Side Revision Diff

## Prerequisites

- Node.js 20.9+ and pnpm 10.
- Workspace dependencies installed with `pnpm install`.
- The documented local database and application environment from `apps/web/.env.example` for page/revision and Playwright checks.
- A test page with at least three visible revisions, including a non-adjacent pair, a whitespace-only edit, a substantive edit, and at least one rendered block such as a heading, list, table, image, code block, or diagram.

## 1. Static checks and focused tests

Run from the repository root:

```bash
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web build
```

Expected outcomes:

- Pure diff-model tests cover empty input, newline variants, non-adjacent changes, paired replacement rows, additions/removals, context `0`, default `3`, Full context, collapsed ranges, and representative 5,000-line inputs.
- Whitespace tests cover spaces, tabs, blank lines, leading/trailing whitespace, and internal whitespace. They prove original text is displayed while only whitespace-only changes disappear.
- URL tests cover ascending normalization, invalid/same-version pairs, default omission, options restoration, and preservation of unrelated search parameters.
- Scroll tests cover both directions, echo suppression, missing anchors, and resize-triggered map rebuilding.
- The production build keeps server-only pipeline modules out of the browser diff bundle and preserves existing single-revision URLs.

## 2. History selection and canonical navigation

1. Sign in as a reader who can view the test page's history and open `/history/<path>`.
2. Select two non-adjacent revisions, first in descending order and then in ascending order.
3. Verify Compare becomes available only for two distinct revisions and each selection navigates to one ascending `/revisions/<a>..<b>/<path>` URL.
4. Copy the address, reload it, open it in a new tab, and use browser back/forward. Verify the exact pair and all options are restored.
5. Open an existing `/revisions/<n>/<path>` link and verify its single-revision behavior is unchanged.

## 3. Source diff behavior

1. Open the selected pair with no comparison search parameters. Verify source view, left-earlier/right-later ordering, original line numbers, and three unchanged context lines around each changed hunk.
2. Set `context=0`, a larger context value, and `context=full`. Verify only source view collapses or expands unchanged rows and Full context displays all original source lines.
3. Enable Ignore whitespace on a pair that has both whitespace-only and substantive edits. Verify only cosmetic differences disappear and rendered source text remains exactly as authored.
4. Scroll both source panes from several hunks and to both extremes. Verify linked movement is stable and that `sync=0` stops only future linked movement.
5. Verify no-difference, same-selection prevention, and browser-computation failure states are understandable and usable without browser alert dialogs.

## 4. Preview behavior

1. Switch the same pair to `view=preview`. Verify each side renders the stored revision appearance through the normal code, Mermaid, math, table, and asset treatment where present.
2. Verify blocks related to changed source regions are identifiable, while the preview remains a complete structurally valid document rather than a line-sliced fragment.
3. Change context, whitespace, and sync options, then switch back to Source and again to Preview. Verify the pair and options remain unchanged.
4. Verify preview linked scrolling follows corresponding block anchors and remains stable after images or diagrams change height.
5. Compare revisions with a frontmatter-only change and verify the source or metadata indicator appears without a misleading rendered-block highlight.

## 5. Permission and server-boundary regression checks

1. Use a user who can read published history but not a draft revision. Open a direct pair URL containing that draft and verify it exposes neither revision source, preview, title, line count, nor which side was unavailable.
2. Verify the browser network log contains no request to `/api/v1/pages/{id}/revisions/{version}/diff` and that no new Diff endpoint or response schema is introduced.
3. Confirm that selecting, opening, changing options, and scrolling do not create a new revision, change publication, invoke cache invalidation, or modify page data.

## References

- [Implementation plan](./plan.md)
- [Research decisions](./research.md)
- [Data model](./data-model.md)
- [Revision Diff UI contract](./contracts/revision-diff-ui.md)
