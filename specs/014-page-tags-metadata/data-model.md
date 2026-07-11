# Data Model: Page Tags and Metadata

## Existing entities

`pages.title` remains the canonical current title. `page_revisions` remains the
immutable source revision; raw Markdown stays in the active content store.
Public reader/list queries select metadata from `current_published_version_id`;
editors use the latest revision.

## New entities

### Tag

| Field | Rules |
| --- | --- |
| `id` | Stable UUID exposed by API/MCP. |
| `space_id` | Required wiki-space scope. |
| `name` | Trimmed display name. |
| `normalized_name` | Case-folded trimmed identity; unique for active tags in a space. |
| `created_at`, `updated_at` | Audit timestamps. |
| `deleted_at` | Soft retirement; not available for new assignments. |

### Page revision metadata

One immutable row per revision.

| Field | Rules |
| --- | --- |
| `revision_id` | Primary key and revision foreign key. |
| `title` | Required snapshot matching canonical title at save time. |
| `date` | Nullable `YYYY-MM-DD` calendar date. |
| `summary` | Nullable trimmed non-empty descriptive text. |
| `created_at` | Traceability timestamp. |

### Page revision tag

| Field | Rules |
| --- | --- |
| `revision_id` + `tag_id` | Composite identity; no duplicate tag per revision. |
| `tag_name` | Display snapshot for historical revisions. |
| `normalized_name` | Snapshot identity used to serialize frontmatter. |

Current tag filtering joins the page's published revision to these rows. Raw
frontmatter filtering remains accepted for compatibility but is implemented by
the same normalized tag identity.

### Tag mutation operation

| Field | Rules |
| --- | --- |
| `id`, `tag_id`, `kind` | Stable operation and target; kind is rename/delete. |
| `status` | queued, running, succeeded, or failed. |
| `requested_name` | Required only for rename. |
| actor/timestamps | Audit trace. |
| count/failure | Visibility-safe completion summary. |

## Relationships and invariants

```text
Page 1 ── * PageRevision 1 ── 1 PageRevisionMetadata
                             └── * PageRevisionTag * ── 1 Tag
Tag 1 ── * TagMutationOperation
```

- Every supported metadata write creates one revision plus matching snapshots.
- Publishing changes the public metadata/tag visibility by switching the
  existing published-revision pointer.
- Valid supported frontmatter, structured metadata, tag snapshot, and rendered
  body derive from the same revision; unrelated frontmatter and body survive.
- Tag rename/delete revisions are committed as one fan-out operation or the
  mutation fails without a partial completed state.
