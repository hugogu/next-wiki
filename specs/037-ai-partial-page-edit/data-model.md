# Data Model: AI Anchored Partial Page Edits

No new database table and no schema migration. Every entity this feature
introduces is a transient shape carried inside one tool call's arguments and
result — already covered by the existing generic `ai_tool_calls.arguments`
/`ai_tool_calls.resultSummary` JSONB columns (`apps/web/src/server/db/schema/ai-tools.ts`),
the same way `insert_generated_images`'s `images` array is today. The only
persisted effect of a successful call is a normal `page_revisions` row created
through the existing `content.createDraft` path (P8 Version Source Content) —
identical in shape to a revision created by `save_draft` or
`insert_generated_images`.

## Transient request/response shapes

### AnchoredEditOperation

One requested change within a call. Not persisted independently; appears only
inside the tool call's JSONB `arguments.edits[]`.

| Field | Type | Notes |
|---|---|---|
| anchor | string, 1–20,000 chars | Exact literal excerpt copied from the current revision's `contentSource`. Must occur exactly once in it (FR-003). |
| mode | enum: `insertBefore` \| `insertAfter` \| `replace` | What to do relative to `anchor` (FR-001). `replace` with empty `text` deletes the anchor outright (spec Assumptions — no separate delete mode). |
| text | string | Content to insert (for `insertBefore`/`insertAfter`) or the replacement (for `replace`). Empty string is valid only for `replace`. |

### AnchoredEditRequest (tool call arguments)

| Field | Type | Notes |
|---|---|---|
| pageId | string (page id) | Existing page only — mirrors `save_draft.pageId` (FR-005 in spec's parent tool, existing pattern). |
| revisionId | string (revision id) | The revision every anchor is verified against; mirrors `insert_generated_images.revisionId`. Mismatch against the page's current latest revision fails the whole call (Edge Cases: stale revision). |
| edits | AnchoredEditOperation[], 1–20 items | Applied atomically: all validated before any are applied (FR-003, FR-004). |

### AnchoredEditResult (tool call result / `resultSummary`)

| Field | Type | Notes |
|---|---|---|
| pageId | string | Echoes the target page. |
| version | integer | The new draft revision's version number, for the model to reference in its answer. |
| editsApplied | integer | Count of edits applied (always `edits.length` on success — the operation is all-or-nothing). |

### Content-Loss Check Outcome (save_draft safety net, FR-009)

Not a stored entity — a computed guard evaluated inside `execSaveDraft` before
`createDraft` is called. Compares the submitted `contentSource.length` against
the current revision's `contentSource.length`. Below the configured ratio
(research.md Decision 5), the call is rejected with a safe, actionable error —
`effectiveReview` cannot be changed from inside the executor, since the
runtime resolves and records it before the executor ever runs, and
`page_draft`-category executors do not gate execution on it today (unlike
`metadata`/`tag` executors via `proposeOrApply`). The one new field is on the
*request*, not a stored entity: `save_draft.acknowledgedContentReduction`
(optional boolean, default false) — when true, the guard is skipped and
`createDraft` proceeds normally. No schema change: this is a new optional key
inside the same `ai_tool_calls.arguments` JSONB column every tool already
uses.

## Reused existing entities (unchanged)

- **`page_revisions`** (`content_versioning` mandate): the anchored-edit tool's
  only persisted output, written through the existing `createDraft` service
  call. No new column, no new revision kind.
- **`ai_tool_calls`**: the audit record for every call to the new tool,
  identical in shape to `save_draft`/`insert_generated_images` calls today
  (`toolName = 'insert_page_content'`, `arguments`, `resultSummary`,
  `requestedReview`/`effectiveReview`).
- **`ai_tool_change_proposals`**: NOT used by this feature — page-content
  mutations are represented as drafts (page diff/history), not change
  proposals, exactly like `save_draft` (see `ai-tool-registry.ts` comment: "A
  reviewable mutation that a page draft cannot represent").
