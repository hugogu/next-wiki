# Data Model: Client-Side Revision Diff

## Overview

This feature introduces no database schema, API resource, persisted preference, or stored comparison result. It consumes two existing immutable revision views and derives all comparison structures in the browser.

## Existing Inputs

### Authorized Revision View

| Field | Source | Use | Rules |
|---|---|---|---|
| `version` | Existing revision read | Pair identity and displayed label | Positive integer; two selected versions must differ. |
| `status` | Existing revision read | Existing revision context | Read-only; comparison never changes it. |
| `contentSource` | Existing immutable revision source | Line comparison and original line display | Never normalized for display or persisted by this feature. |
| `contentHtml` | Existing stored pipeline output | Preview rendering | Must be treated as the existing sanitized revision output and mounted through `ContentRenderer`. |
| `authorDisplayName`, `createdAt` | Existing revision read | Optional version context | Shown only after both revisions are authorized. |

The pair route reads both inputs under the existing permission rules. If either read is unavailable, no `Revision Pair` or partial comparison model is exposed.

## Derived Client Entities

### Revision Pair

| Field | Description | Rules |
|---|---|---|
| `earlier` | Authorized revision with the lower version | Always the left side. |
| `later` | Authorized revision with the higher version | Always the right side. |
| `routePair` | Canonical `<earlier>..<later>` string | Distinct positive integers in ascending order. |

### Comparison Options

| Field | URL representation | Default | Rules |
|---|---|---|---|
| `view` | `view=source` or `view=preview` | `source` | Controls only presentation. |
| `ignoreWhitespace` | `ignoreWhitespace=1` when enabled | disabled | Comparison keys ignore all whitespace; original display text is unchanged. |
| `context` | `context=<non-negative integer>` or `context=full` | `3` | Controls source hunk context; preview uses it for relevant-block highlighting/navigation only. |
| `sync` | `sync=0` when disabled | enabled | Controls linked vertical scrolling only. |

Unknown, malformed, or duplicate option values resolve to the documented default and are removed when the client normalizes the address. Options are not written to a database, browser storage, or revision record.

### Source Line Token

| Field | Description | Rules |
|---|---|---|
| `number` | Original 1-based logical source line number | Retained even when comparison ignores whitespace. |
| `text` | Original source text for that line | Never replaced with a normalized comparison value. |
| `compareKey` | Exact text or whitespace-stripped text | Used only by the comparison algorithm. |

### Aligned Row

| Field | Description | Rules |
|---|---|---|
| `left` | Optional earlier-source token | Omitted only for an added line. |
| `right` | Optional later-source token | Omitted only for a removed line. |
| `kind` | `unchanged`, `added`, `removed`, or `changed` | Adjacent removed/added runs are paired into `changed` rows where possible. |
| `changeId` | Optional contiguous change-region identity | Shared by both cells in one change region. |

Rows represent the full pair before context filtering. They provide equal-height source cells, stable source-scroll anchors, and exact changed line ranges.

### Display Hunk

| Field | Description | Rules |
|---|---|---|
| `rows` | Visible aligned rows | Contains each changed row plus configured neighboring unchanged rows. |
| `collapsedRange` | Omitted contiguous unchanged rows between visible hunks | Represented by a paired separator with skipped original line ranges. |
| `changedLineRanges` | Earlier/later source ranges touched by the hunk | Used to identify relevant rendered preview blocks. |

With `context=full`, the display model contains every aligned row and no collapsed range. With `context=0`, every changed row remains visible but no unchanged row is included solely as context.

### Preview Anchor

| Field | Description | Rules |
|---|---|---|
| `sourceLine` | Source line associated with an existing rendered block | Derived from existing `data-line`, adjusted for that revision's frontmatter offset. |
| `offsetTop` | Block position in its scroll container | Recomputed after asynchronous content resizes. |
| `changeState` | `unchanged` or relevant-to-change | Block-level indicator only; never claims character-level precision. |

## Relationships and Invariants

```text
Authorized Revision View (earlier) ─┐
                                    ├─> Revision Pair ─> Source Line Tokens
Authorized Revision View (later) ──┘                         │
                                                              ├─> Aligned Rows ─> Display Hunks
Comparison Options ──────────────────────────────────────────┘                    │
                                                                                   └─> Preview Anchors
```

1. A comparison always has exactly two distinct revisions of one page.
2. Only a pair for which both existing permission checks succeed can create any derived entity or visible result.
3. Original source is immutable input. `compareKey`, hunk filtering, preview classes, and scroll position never alter source, HTML, status, or metadata.
4. Stored rendered HTML remains the rendering pipeline output; preview adds only transient client-side classes or attributes around relevant blocks.
5. `data-line` anchors describe rendered blocks, not every source character. Frontmatter-only changes retain a source change indication without a false rendered-block highlight.
6. The URL is the durable representation of a `Revision Pair` and its `Comparison Options`; scroll offsets and DOM measurements are transient implementation state and deliberately absent from the URL.

## State Transitions

```text
History selection
  └─ select two distinct visible revisions ─> canonical Revision Pair route

Canonical Revision Pair route
  ├─ both authorized reads available ─> source or preview display model
  ├─ either read unavailable ─> existing not-found/access outcome, no model
  └─ malformed/same-version pair ─> invalid route outcome

Displayed model
  ├─ URL option change ─> recompute derived model in browser
  ├─ view change ─> preserve pair/options and change presentation only
  └─ browser navigation ─> reconstruct model from route and options
```

No state transition writes to PostgreSQL, calls a comparison API, or triggers public-content cache invalidation.
