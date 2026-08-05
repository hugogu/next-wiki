# Data Model: Cross-Space Page Migration

## Existing entities used or extended

### Page (`pages`)

| Field / relation | Migration behavior |
|---|---|
| `id` | Preserved; it remains the durable identity across spaces. |
| `space_id`, `path`, `locale` | Updated atomically per item to the reviewed destination mapping. |
| `nature`, `visibility` | Entering AI Generation classifies `nature` as generated without asserting a model source. Visibility defaults to the stricter value. |
| `translation_group_id`, `source_page_id` | An original-page selection expands to all translated variants; a translation cannot be selected alone. |
| explicit page permissions | Dropped on move so the page inherits the destination space permissions, per the permission mandate. |

### Page revision and metadata

All existing revisions, source metadata, asset references, and import mappings
are retained. Each moved variant creates one new destination-facing revision to
copy/re-resolve structured metadata and tags in the destination space. If
needed, that same revision adds conformant generated-document frontmatter. Its
actor is the initiating human Administrator; its audit data states that the
page was classified/moved, not verified as model generated.

### Page route redirect (`page_route_redirects`)

Each successful item records the former canonical route and its stable target
page ID with reason `cross_space_migration`. The existing reader uses it only
after public eligibility succeeds, so it is a redirect input, not a second
address or a disclosure record.

## New entities

### Cross-space migration (`cross_space_migrations`)

One durable preview and, once confirmed, operation.

| Field | Meaning / validation |
|---|---|
| `id` | UUID preview/operation identity. |
| `requested_by` and actor snapshot | Administrator identity and credential context that initiated the preview. |
| `source_space_id`, `target_space_id` | Different enabled Wiki/AI Generation spaces; Raw is invalid. |
| `selection_kind`, `root_page_id`, `source_root_path`, `include_root_page` | Identifies a page or folder-prefix selection without inventing a virtual-folder row. |
| `target_root_path` | Normalized destination root; item mappings must be unique. |
| `visibility_choice`, `options` | Explicit only when deliberately more permissive; stores normalized exclusions and behavior choices. |
| `selection_fingerprint`, `preview_expires_at` | Guards confirmation against stale source, destination, or options. |
| `status`, `cancel_requested` | `previewed`, `queued`, `running`, `completed`, `completed_with_warnings`, `failed`, or `cancelled`; only legal forward transitions. |
| counters and error fields | Total, processed, moved, excluded, conflict, failed counts plus safe operation-level error. |
| timestamps | Preview, confirmation, start, finish, and updated timestamps. |

The normalized confirmation payload is unique for a non-terminal migration so a
repeated confirmed request returns the existing operation rather than creating
a second move.

### Cross-space migration item (`cross_space_migration_items`)

One immutable planned result for each selected page variant.

| Field | Meaning / validation |
|---|---|
| `migration_id`, `page_id` | Unique item for the operation and stable page identity. |
| source snapshot | Original space, path, locale, latest/published revision IDs, update marker, and old canonical route. |
| destination mapping | Target space, path, locale, and target canonical route; unique within one operation after normalization. |
| `adaptation` | `none`, `metadata_rehome`, `okf_frontmatter`, or safe reference rewrite; previewed before execution. |
| `status` | `pending`, `running`, `moved`, `excluded`, `conflicted`, `failed`, `cancelled`, or `skipped`; monotonic. |
| result | Migration revision ID where created, timestamps, attempts, safe warning/error code and text. |

## Relationships

```text
Cross-space migration 1 ── * Migration item * ── 1 Page ── * Page revision
                                                │
                                                └── * Page route redirect
```

## State Transitions

```text
previewed -- confirm/fingerprint valid --> queued --> running
    │                                      │          │
    └-- expire/stale --> require preview   │          ├--> completed
                                           │          ├--> completed_with_warnings
                                           │          ├--> failed
                                           │          └--> cancelled
                                           └-- cancel --> cancelled
```

Items move from `pending` to one terminal state in a short transaction. A
retry/recovery skips `moved` items and revalidates unfinished items. A changed
source revision, permission, destination occupancy, or selection snapshot
becomes `conflicted`; it never silently changes the reviewed mapping.
