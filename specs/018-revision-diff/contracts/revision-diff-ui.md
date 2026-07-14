# Revision Diff UI Contract

## Purpose

This internal UI and route contract defines the client-side comparison of two page revisions. It adds no public HTTP API and does not change the existing revision Diff endpoint.

## 1. Entry Points and Route Shape

| Purpose | Address | Contract |
|---|---|---|
| History selection and comparison | `/history/<path>?selected=<n>` or `/history/<path>?compare=<a>..<b>` | The sole interface for choosing visible revisions. One selected revision renders its stored content; two selected revisions present their client-side Diff. |
| Existing single revision | `/revisions/<n>/<path>` | Remains valid and renders one revision as today. |
| Legacy comparison | `/revisions/<a>..<b>/<path>` | Redirects to the canonical history URL. `a` and `b` are distinct positive integers, with `a < b`. |

The history selector sorts a valid selection before loading the pair into the history URL. A direct valid reversed pair is normalized to ascending order while retaining valid option parameters. A pair with an invalid number or identical versions follows the normal invalid-route outcome. The history route performs the existing permission-checked reads for both revision numbers; it does not call a Diff endpoint.

## 2. Comparison Search Parameters

| Parameter | Values | Default when absent | Meaning |
|---|---|---|---|
| `view` | `source`, `preview` | `source` | Active comparison presentation. |
| `context` | Non-negative base-10 integer, `full` | `3` | Unchanged source lines around each changed hunk. |
| `ignoreWhitespace` | `1` | disabled | Excludes changes containing only whitespace from the comparison. |
| `sync` | `0` | enabled | Disables linked vertical scrolling. |

Canonical URLs omit default values. Unknown keys unrelated to comparison are preserved by option updates; malformed comparison values resolve to defaults and are removed by normalization. Every control updates the address without changing either revision.

Example:

```text
/revisions/3..8/engineering/guide?view=preview&context=full&ignoreWhitespace=1&sync=0
```

## 3. Source Diff Presentation

1. The left pane represents the earlier revision; the right pane represents the later revision.
2. Each pane displays the original source line number and source text. The comparison must not display whitespace-normalized text.
3. A paired row has one of four visual states: unchanged, removed, added, or changed. One-sided rows have a visibly empty corresponding cell so rows remain aligned.
4. Default context is three unchanged rows before and after every contiguous change region. Intervening unchanged regions are a collapsed separator with the omitted left and right line ranges.
5. `context=0` has no unchanged context. `context=full` has no collapsed separator and presents every source row.
6. Ignore whitespace changes only comparison keys. A change with equal whitespace-stripped line values is classified as unchanged; any substantive character difference remains changed.

## 4. Preview Presentation

1. Preview displays the same two selected revisions side by side using their existing stored, sanitized rendered HTML and the shared renderer.
2. Preview renders complete documents; it never slices raw Markdown at hunk boundaries.
3. Rendered blocks whose source-line anchor intersects a changed source range are visibly relevant to the active comparison. This is a block-level aid, not a character-by-character visual claim.
4. The preview adjusts source-line ranges by each revision's frontmatter offset before matching rendered anchors. Frontmatter-only changes receive a source/metadata change indication instead of an incorrect preview highlight.
5. In preview, context changes which changed or nearby blocks are highlighted or targeted for navigation; it does not hide document structure.

## 5. Linked Scrolling

1. Linked scrolling is enabled unless `sync=0` is present.
2. Source uses aligned row/change anchors. Preview uses rendered `data-line` block anchors and monotonic interpolation between corresponding positions.
3. Programmatic scroll updates are recognized and ignored by the opposite listener to prevent feedback loops.
4. Scroll maps are rebuilt after rendered content resizes, including late image or diagram rendering. If no usable anchors exist, the implementation falls back to bounded proportional mapping.
5. Disabling linked scrolling stops programmatic movement of the opposite pane without resetting either pane's current position.

## 6. Visibility, Errors, and Non-Mutation

- Both selected revision reads must succeed before the comparison displays any revision-specific title, line, source, preview, count, or difference status.
- If either read is unavailable, use the existing inaccessible/not-found route outcome without identifying which revision failed.
- A browser-side comparison failure displays a localized, recoverable message that permits retrying or changing selections. It has no server-side fallback.
- Switching views and options, opening a pair, and scrolling never create, mutate, publish, restore, delete, cache, or otherwise persist a revision.
- The existing `GET /api/v1/pages/{id}/revisions/{version}/diff` contract remains unchanged and must have no caller introduced by this feature.

## 7. Accessibility Contract

- Revision selectors, Compare, view controls, whitespace/context/sync controls, collapsed regions, and both panes have localized accessible names and keyboard-operable behavior.
- Compare remains unavailable until exactly two distinct visible revisions are selected and explains the current selection requirement.
- Source-row state is conveyed by text or semantics in addition to color. Focus remains predictable when a route or option changes.
- Errors and no-difference results use an announced status surface, never a browser alert dialog.
