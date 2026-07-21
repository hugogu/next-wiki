# Contract: API Delta

**Feature**: 025-feishu-bot-conversation-capture

All new or changed REST surfaces reuse existing route/session helpers, shared Zod schemas in `packages/shared`, and the same service layer used by 023. API changes require regenerating OpenAPI docs via `next-open-api`.

## Summary

Three contract-level changes:

1. The Content Data Source keying is renamed. The literal `'wiki-ai-conversations'` becomes `'ai-conversations'` and the legacy literal is treated as a back-compat alias during the migration window.
2. The `RawConversationPointer` resource (returned by AI session list/detail and surfaced by the v1 public raw-conversation read endpoint) gains an optional `channel` field that distinguishes `'wiki-ai'` from `'feishu'` capture origin.
3. The first-party Admin UI moves the Data Sources editor to Bots' General settings. The REST route remains `/api/settings/content-data-sources`; this is an API namespace, not the canonical UI location.

No new routes, no new shape changes, no removal of existing fields.

## Admin Data Sources Settings API

### `GET /api/settings/content-data-sources`

Admin-only. Returns the registered source list. After the rename, only the renamed source appears in the response; the legacy alias is hidden. First-party UI calls this from Bots' General settings.

Response:

```json
{
  "items": [
    {
      "sourceKey": "ai-conversations",
      "category": "content",
      "label": "AI Conversations",
      "description": "Capture every AI conversation — Wiki AI and Feishu bot — as Raw Conversation pages.",
      "enabled": false,
      "available": true,
      "unavailableReason": null,
      "updatedAt": "2026-07-21T00:00:00.000Z"
    }
  ]
}
```

Notes:

- `available=false` when Raw content is not available in the current writing mode (same rule as 023).
- The legacy `'wiki-ai-conversations'` row, if any, never appears here; it is read-only and only used by `isDataSourceEnabled` as a hidden alias source.

### `PATCH /api/settings/content-data-sources/[sourceKey]`

Admin-only. Same body and response as 023, but the canonical `sourceKey` is now `'ai-conversations'`:

```json
{ "enabled": true }
```

If a client requests the legacy `'wiki-ai-conversations'` key, the route returns `404 source_not_found` (the legacy key is intentionally unregistered in the Admin-facing list to prevent drift). Internal calls (`isDataSourceEnabled`) handle the alias transparently.

## AI Session List / Detail

### `GET /api/ai/sessions` and `GET /api/ai/sessions/[id]`

These surfaces include `RawConversationPointer` on each session that has a captured page. After this feature, the pointer carries an optional `channel` field:

```json
{
  "sessionId": "uuid",
  "rawConversation": {
    "pageId": "uuid",
    "path": "conversations/2026/07/21/<action-id>",
    "url": "/spaces/raw/conversations/2026/07/21/<action-id>",
    "captureStatus": "captured",
    "channel": "feishu",
    "conversation": {
      "status": "completed",
      "question": "...",
      "answer": "...",
      "thinking": "",
      "citations": [],
      "insufficient": false,
      "errorMessage": null,
      "queuedAt": "2026-07-21T11:00:00.000Z",
      "startedAt": "2026-07-21T11:00:00.500Z",
      "finishedAt": "2026-07-21T11:00:08.000Z"
    }
  }
}
```

`channel` is omitted (not `null`) for legacy captures pre-dating the field; AI surfaces that do not understand the absence fall back to `'wiki-ai'`.

## V1 Public Raw Resources

### `GET /api/v1/raw/pages/{path}` and search results

The public Raw page resource already includes `raw_pages[*].rawCategory`, `source`, etc. After this feature:

- `sourceMetadata.channel` is included on Raw Conversation pages captured after the deploy.
- The MCP search tool (`packages/mcp-server/src/tools/list-pages.ts`-style) carries the same field on each Raw Conversation result; existing tool descriptions are updated to mention the `channel` flag.

No new endpoint is added.

## Feishu Module Surfaces

No change. The Feishu admin routes, binding routes, subscription routes, and notification fan-out are unchanged. The capture path naturally produces Captured turn pages without exposing new external APIs.

## Backwards Compatibility

| Client | Behavior |
|---|---|
| Web chat side pane | Unchanged. `RawConversationPointer.channel` is read if present; absent for legacy captures. |
| MCP search tools | Existing tools return the new field; existing tool descriptions already tolerate unknown fields. |
| First-party Admin UI | Renders the renamed label and description inside Bots' General settings; the old Content settings writer is removed, redirected, or changed to a link so there is no duplicate editor. |
| External clients using the legacy literal `'wiki-ai-conversations'` | Read-end alias is automatic; write-end returns `404 source_not_found`. Existing deployments never break because the legacy row's `enabled` state is migrated lazily on the first read after deploy. |

## OpenAPI Regeneration

Re-run `pnpm --filter @next-wiki/web openapi:generate` (or the project's equivalent) after the changes; verify that:

- The data source list response shape is unchanged in structure.
- The data source label in the example is updated to `AI Conversations`.
- The `RawConversationPointer` example gains the `channel` enum entry.

Commit the regenerated docs in the same change set, per the project's `AGENTS.md` rule: "When there is API changes, update docs via next-open-api."
