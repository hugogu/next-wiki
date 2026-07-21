# Data Model: Feishu Bot Conversation Capture

**Date**: 2026-07-21 | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

This feature extends the 023 Raw Conversation data model only by adding additive metadata. **No new tables and no Drizzle migrations are required.** All persistent schema remains the same; the only persistent-key change is renaming the data-source literal from `'wiki-ai-conversations'` to `'ai-conversations'` with a back-compat alias.

## Schema Changes

### No new columns. No new tables. No new indexes.

The capture mechanism (`apps/web/src/server/services/raw-conversations.ts`) writes its per-revision structured snapshot into the existing JSONB column `page_revisions.source_metadata`. That column is already defined (see 023 data-model) and is the only place the new `channel` field is stored.

## New Persistent Key

### `content_data_source_settings.source_key` (rename legacy key)

| Column | Type | Notes |
|---|---|---|
| `source_key` | text PK | Canonical value is now `'ai-conversations'`. The legacy literal `'wiki-ai-conversations'` is retained as a hidden alias during the migration window and resolved to the canonical row on read. |

Application rules:

- New canonical key, defined in `packages/shared/src/content-data-sources.ts` as `AI_CONVERSATIONS_SOURCE_KEY = 'ai-conversations'`.
- `WIKI_AI_CONVERSATIONS_SOURCE_KEY` becomes an internal alias constant for back-compat reads only.
- `content-data-sources.ts::isDataSourceEnabled` looks up `'ai-conversations'` first; if no row exists, it transparently reads the legacy row's `enabled` value. The Admin UI never shows the legacy row.
- Writes always target the new key. The legacy row remains a read-only stub.
- Seed (`apps/web/src/server/seed/index.ts`) inserts the new key on first boot for new deployments. For existing deployments, the first read triggers a lazy migration: if the new key row does not exist but the legacy row does, copy `enabled` + `config` to the new row, optionally mark the legacy row with a future-proof flag indicating "alias-of=ai-conversations" (no schema change; just metadata in `config`).
- The only writable Admin UI for this source is Bots' General settings (`/admin/bots?tab=general`). The former Content settings Data Sources screen is removed, redirected, or reduced to navigation pointing to Bots' General.

## Extended JSONB Shape

### `page_revisions.source_metadata` for Conversation Raw revisions

Additive fields on the existing 023 schema (line `packages/shared/src/ai.ts:662`):

| Field | Type | Default | Notes |
|---|---|---|---|
| `channel` | `'wiki-ai' \| 'feishu'` (optional) | absent for legacy pages; inferred at capture time for new pages | Recorded from `ai_actions.requestMetadata.origin` of the captured action. `'feishu'` is written when the inbound origin is `'feishu'`; any other (including absent legacy) resolves to `'wiki-ai'`. Read by the Bots' General Data Sources panel and by `RawConversationPointer`. Never indexed as part of the searchable text. |

Backward compatibility: existing revisions (none pre-existing for newly captured Feishu turns because 023 has not shipped widely yet, but pre-existing Wiki AI capture revisions if any) continue to be valid because the new field is `optional()`. Renderer ignores the field; admin surfaces that want to show it treat absent as `'wiki-ai'`.

### `RawConversationPointer`

Additive field exposed to first-party AI session detail, AI Chat History list, and search-result preview payloads (`packages/shared/src/ai.ts:440`):

| Field | Type | Notes |
|---|---|---|
| `channel` | `'wiki-ai' \| 'feishu'` | Driven by the underlying page's `source_metadata.channel`. Default `'wiki-ai'` for legacy pages. |

The MCP search tool response and the public AI session detail endpoint both surface this field so external integrations can distinguish channels without bespoke logic.

## Schema Versioning

The existing `source_metadata.schemaVersion = 1` discriminator continues to gate rendering. The new `channel` field is forward-compatible: a future `schemaVersion = 2` revision could carry additional structured fields without breaking the v1 renderer.

## Validation Rules

| Rule | Enforcement |
|---|---|
| Only registered data-source keys are read/written through service | `content-data-sources.ts` registry gate |
| Data-source rename preserves state on existing deployments | lazy migration in `content-data-sources.ts::isDataSourceEnabled` |
| `channel` field is honored but never indexed as text | capture worker writes channel into structured metadata; transcript text remains the searchable surface |
| Bot Session table stores no conversation timeline | `feishuBotSessions` schema unchanged; verified at code-review time |
| Multi-turn continuity preserved across capture | `feishu-sessions.ts::attachActionToSession` continues to update `ai_action_id`; each turn still becomes its own `ai_action` and its own Raw page |
| Audit log carries `origin='feishu'` for Feishu captures | capture worker reads `action.requestMetadata.origin` and threads it through the audit entry |
| Rename of data-source label preserved across locales | i18n keys renamed in `apps/web/messages/{en,zh}.json`; no duplicate keys |

## Entities

### AI Conversations Data Source (renamed)

- Stored in `content_data_source_settings(source_key='ai-conversations')`.
- One Admin-facing toggle under Bots' General settings. State preserved across the rename.
- Labels: `dataSources.content.aiConversations.label`, `…description` in i18n.

### Wiki AI Record

- Same as 023 entity definition. For Feishu turns, the `ai_actions` row carries `requestMetadata.origin='feishu'` and `requestMetadata.feishuSessionId=<Bot Session id>`.
- Captured Raw page is the canonical durable record for that turn.

### Feishu Bot Session (unchanged)

- `feishuBotSessions(id, binding_id, chat_id, ai_action_id, state, last_activity_at, expires_at)`. No question / answer / citations / status columns are added.

### Raw Conversation Page (extended)

- Same as 023 entity. The new `source_metadata.channel` field is added.

### Channel Marker (new)

- A read-only metadata field on each Conversation Raw revision and on each `RawConversationPointer` that records the capture channel. Not user-editable. Does not affect rendering.

## State Transitions

The 023 capture state diagram remains authoritative. The rename changes no observable transition.

The new "Channel Marker" field follows these transitions:

```text
[new turn] ──captured by enable source + valid action──▶ channel='feishu' or channel='wiki-ai' (inferred once, immutable)
[legacy pre-025 page] ──read──▶ channel absent (treated as 'wiki-ai' by admin surfaces)
```

## Migration / Backfill

| Step | Description | Where |
|---|---|---|
| 1 | Add `AI_CONVERSATIONS_SOURCE_KEY` constant; alias legacy key | `packages/shared/src/content-data-sources.ts` |
| 2 | Lazy migration in `isDataSourceEnabled` | `apps/web/src/server/services/content-data-sources.ts` |
| 3 | Seed inserts new key for fresh deployments | `apps/web/src/server/seed/index.ts` |
| 4 | i18n renames (`wikiAiConversations` → `aiConversations`) | `apps/web/messages/{en,zh}.json`, `apps/web/src/i18n/keys.ts` |
| 5 | Extend `rawConversationSourceMetadataSchema` and `RawConversationPointer` with `channel` | `packages/shared/src/ai.ts` |
| 6 | Capture worker stamps `channel` per `requestMetadata.origin` | `apps/web/src/server/services/raw-conversations.ts` |
| 7 | Capture worker threads `origin` to audit entry | `apps/web/src/server/jobs/raw-conversation-capture.ts` |
| 8 | Move the Admin Data Sources editor into Bots' General settings and remove/redirect the duplicate Content settings editor | `apps/web/src/components/admin/bots/BotsTabs.tsx`, `apps/web/app/(admin)/admin/content/page.tsx` |

No raw content backfill is required. No legacy Bot Session rows need rewrites.
