# Data Model: Raw Conversation Search

**Date**: 2026-07-21 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

All schema changes must be produced by editing `apps/web/src/server/db/schema/{index.ts,enums.ts}` and running `pnpm db:generate`; do not hand-author migration SQL or journal entries.

## New / Changed Tables

### `content_data_source_settings` (new)

Site-wide registry-backed settings for Content > Data Sources.

| Column | Type | Notes |
|---|---|---|
| `source_key` | text PK | Stable registered key. First value: `wiki-ai-conversations` |
| `enabled` | boolean NOT NULL default false | Existing deployments default to no capture |
| `config` | jsonb NOT NULL default `{}` | Reserved for future per-source settings; not used by 023 beyond schema versioning |
| `updated_by` | uuid NULL FK -> `users.id` ON DELETE SET NULL | Last Admin updater |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | |

Validation:

- Only keys registered in `services/content-data-sources.ts` may be read/updated through the service.
- `wiki-ai-conversations` is visible only when Raw content is available; if LLM Wiki mode is inactive, update requests fail with a clear source-unavailable result.
- Unknown keys are rejected, not silently inserted.

### `raw_categories` (extend)

| Column | Type | Notes |
|---|---|---|
| `system_key` | text NULL | Non-null for built-in categories. 023 seeds `conversation`; partial unique index on non-null values |

Built-in Conversation category:

- `system_key='conversation'`
- default display name `Conversation`
- default slug `conversation`
- cannot be deleted or retired
- cannot be renamed or reslugged in a way that breaks renderer dispatch or capture filing

Existing user-created categories keep `system_key=NULL`.

### `ai_actions` (extend)

| Column | Type | Notes |
|---|---|---|
| `raw_conversation_page_id` | uuid NULL reference to `pages.id` ON DELETE SET NULL | Set only for captured `wiki_question` actions |
| `raw_conversation_last_event_id` | bigint NOT NULL default 0 | Highest `ai_action_events.id` included in the latest Raw Conversation revision |
| `raw_conversation_capture_status` | text NOT NULL default `not_applicable` | `not_applicable`, `pending`, `captured`, `failed`, `disabled` |
| `raw_conversation_capture_error` | text NULL | Bounded diagnostic for operators, never shown to unauthorized users |

Rules:

- `raw_conversation_page_id` is a pointer to canonical Raw history, not a second copy.
- Existing `page_id` keeps its current meaning: the page context for the question.
- Existing legacy rows remain null and are not migrated.
- `finishAction` and cleanup paths must preserve these fields.

## Existing Tables Reused

### `pages`

Raw Conversation is represented by a normal Raw-space page:

- `space.kind='raw'`
- `raw_category_id` points to the built-in Conversation category
- `nature='original'`
- `visibility='restricted'`
- path generated deterministically, for example `conversations/YYYY/MM/DD/<action-id>`

No separate chat session table is introduced.

### `page_revisions`

Each capture snapshot is a normal published Raw revision.

| Existing Field | Conversation Usage |
|---|---|
| `content_type` | `text/markdown` or a dedicated registered conversation MIME if implementation chooses; the search surface remains text transcript |
| `content_source` | normalized transcript used by keyword search, excerpts, and embedding chunking |
| `content_html` | rendered transcript fallback for generic readers |
| `source_metadata` | structured conversation snapshot metadata; never exposed to unauthorized readers |
| `status` | `published` for captured Raw snapshots |
| `actor_kind` | `machine`, because capture is system/worker authored |

`source_metadata` shape for Conversation revisions:

```json
{
  "inputKind": "chat-transcript",
  "sourceType": "wiki-ai-conversation",
  "schemaVersion": 1,
  "actionId": "uuid",
  "eventCursor": 123,
  "conversationStatus": "running|completed|failed|cancelled|expired",
  "questionMode": "full|retrieval",
  "question": "string",
  "answer": "string",
  "thinking": "string",
  "citations": [],
  "insufficient": false,
  "errorMessage": null,
  "queuedAt": "ISO-8601",
  "startedAt": "ISO-8601|null",
  "finishedAt": "ISO-8601|null"
}
```

The transcript in `content_source` is derived from the same view model and includes user question, answer, thinking when retained, citations/source labels, insufficient-answer marker, and safe error/status text. It intentionally avoids raw JSON noise so lexical and vector search index meaningful content.

### `ai_action_events`

Remains the live event stream and legacy detail source. Capture consumes it but does not make it the canonical durable history for newly captured sessions. Events continue to obey existing AI retention cleanup.

## Entities

### Content Data Source Setting

- Key: stable `source_key`
- State: enabled/disabled
- Relationship: governs whether `wiki_question` actions enqueue Raw capture

### Built-in Conversation Category

- Stored as a `raw_categories` row with `system_key='conversation'`
- Relationship: one category -> many Raw Conversation pages
- Protected from retirement/deletion

### Raw Conversation Page

- One page per captured Wiki AI action
- Belongs to raw space and Conversation category
- Relationship: `ai_actions.raw_conversation_page_id -> pages.id`
- Current published revision is the latest captured snapshot

### Conversation Snapshot Revision

- Immutable page revision
- Contains transcript text and structured view metadata
- Relationship: many revisions per Raw Conversation page, one per coalesced capture checkpoint

### Capture Job

- pg-boss job keyed/coalesced by `actionId`
- Reads `ai_action_events` after `raw_conversation_last_event_id`
- Creates the page if missing; otherwise appends a new Raw revision
- Updates action pointer/cursor/status after successful commit

### Legacy AI Chat History Record

- `ai_actions` row with no `raw_conversation_page_id`
- Continues through existing history UI
- Not indexed as Raw and not migrated

## Validation Rules

| Rule | Enforcement |
|---|---|
| Only Admin can view/update Content Data Sources | `content-data-sources.ts` service + route guard |
| Unknown data source keys rejected | registered source map |
| Wiki AI Conversations unavailable outside Raw-capable mode | settings service checks writing mode / raw space availability |
| Conversation category exists before capture | seed and `ensureConversationCategory()` in capture service |
| Conversation category cannot be retired/deleted | `raw-categories.ts` guards on `system_key` |
| One Raw page per captured action | unique logic on `ai_actions.raw_conversation_page_id` plus idempotent path/action checks in service |
| Capture writes append-only Raw revisions | `raw-entries.ts` create/append or equivalent internal helper; never updates prior revisions |
| Capture is idempotent | job skips when latest event cursor already captured; duplicate jobs converge on same page/revision state |
| Captured conversation search respects permissions | search coordinator projection and semantic retrieval candidate checks |
| Raw create/append triggers AI index reconciliation | capture path calls `reconcilePageAcrossIndexes` after committed published revision |
| Legacy sessions not migrated | no startup/backfill job; only new actions after enabled setting are captured |
| History delete does not hard-delete Raw evidence | session service distinguishes legacy hard delete from captured session shortcut/removal behavior |

## State Transitions

### Data Source

```text
disabled ──Admin enables──▶ enabled
enabled  ──Admin disables─▶ disabled
```

Existing Raw Conversation pages are unchanged by toggling.

### Capture

```text
not_applicable
  ├─ source disabled when action created ─▶ disabled
  └─ source enabled + wiki_question event ─▶ pending
pending ──capture commit──▶ captured
pending/captured ──new events arrive──▶ pending ──capture commit──▶ captured
pending ──worker failure──▶ failed ──retry/new event──▶ pending
```

### Raw Conversation Page

```text
[missing] ──first capture──▶ Raw page v1 published
Raw page vn ──coalesced new events/status──▶ Raw page v(n+1) published
Raw page terminal snapshot ──no further events──▶ stable terminal Raw page
```

Terminal statuses: `completed`, `failed`, `cancelled`, `expired`.

### AI History Detail Source

```text
legacy ai_action without raw page ─▶ existing event-log detail
captured ai_action with raw page ─▶ Raw Conversation page/detail view
```

## Migration / Backfill

- Generate one migration for table/column additions and indexes.
- Seed/ensure `content_data_source_settings('wiki-ai-conversations')` disabled.
- Seed/ensure built-in `Conversation` raw category in Raw-capable deployments.
- Do not backfill old `ai_actions` or `ai_action_events` into Raw pages.
