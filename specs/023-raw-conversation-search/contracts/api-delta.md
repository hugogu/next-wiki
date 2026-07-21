# Contract: API Delta

**Feature**: 023-raw-conversation-search

All new or changed REST surfaces use existing route/session helpers, shared Zod schemas in `packages/shared`, and permission checks in the service layer. API changes require regenerating OpenAPI docs via next-open-api.

## Admin Content Data Sources

### `GET /api/settings/content-data-sources`

Admin-only.

Response:

```json
{
  "items": [
    {
      "sourceKey": "wiki-ai-conversations",
      "category": "content",
      "label": "Wiki AI Conversations",
      "description": "Capture new Wiki AI chats as Raw Conversation pages.",
      "enabled": false,
      "available": true,
      "unavailableReason": null,
      "updatedAt": "2026-07-21T00:00:00.000Z"
    }
  ]
}
```

Notes:

- `available=false` when Raw content is not available in the current writing mode.
- Unknown registered future sources may appear in this list, but only registered keys can be updated.

### `PATCH /api/settings/content-data-sources/[sourceKey]`

Admin-only.

Request:

```json
{ "enabled": true }
```

Response: the updated item.

Errors:

| Code | HTTP | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | Unknown source key |
| `FORBIDDEN` | 403 | Caller is not Admin |
| `DATA_SOURCE_UNAVAILABLE` | 409 | Source cannot run in the current writing mode |

## Raw Categories v1

Existing `GET /api/v1/raw-categories` and admin category routes add system metadata.

Category item additions:

```json
{
  "id": "uuid",
  "name": "Conversation",
  "slug": "conversation",
  "systemKey": "conversation",
  "isSystem": true
}
```

Rules:

- `systemKey` is nullable for user-managed categories.
- Built-in categories cannot be retired or deleted.
- Updates that would remove the built-in Conversation semantics return `409 RAW_CATEGORY_SYSTEM_PROTECTED`.

## AI Sessions

### `GET /api/ai/sessions`

Existing list response extends each item:

```json
{
  "id": "uuid",
  "status": "completed",
  "questionExcerpt": "How do I...",
  "rawConversation": {
    "pageId": "uuid",
    "path": "conversations/2026/07/21/...",
    "url": "/spaces/raw/conversations/2026/07/21/...",
    "captureStatus": "captured"
  }
}
```

For legacy sessions, `rawConversation` is `null`.

Search behavior:

- Legacy rows may continue searching `ai_action_events.question`.
- Captured rows should search the Raw Conversation transcript when available, or the action question fallback while capture is pending.

### `GET /api/ai/sessions/[id]`

Existing response extends:

```json
{
  "action": { "...": "existing AiActionView fields" },
  "events": [],
  "rawConversation": {
    "pageId": "uuid",
    "path": "conversations/2026/07/21/...",
    "url": "/spaces/raw/conversations/2026/07/21/...",
    "captureStatus": "captured",
    "conversation": {
      "status": "completed",
      "question": "...",
      "answer": "...",
      "thinking": "",
      "citations": [],
      "insufficient": false,
      "errorMessage": null
    }
  }
}
```

Rules:

- Captured sessions return Raw-derived `rawConversation.conversation` when available.
- Legacy sessions keep the current `events`-based detail behavior.
- Unauthorized callers receive the existing non-disclosing not-found behavior.

### `DELETE /api/ai/sessions/[id]`

Behavior changes for captured sessions:

- Legacy sessions may keep existing hard-delete behavior.
- Captured sessions must not hard-delete the Raw Conversation page.
- The route either rejects with `409 RAW_CONVERSATION_IMMUTABLE` or removes only the history shortcut/association according to the implementation task decision; the UI must not describe this as deleting Raw evidence.

## Raw Conversation Page Resource

Existing page/revision endpoints keep returning normal Raw page resources. For permitted callers, a Raw Conversation page exposes enough metadata for renderer dispatch.

Revision additions/usage:

```json
{
  "contentType": "text/markdown",
  "source": {
    "inputKind": "chat-transcript",
    "sourceType": "wiki-ai-conversation",
    "actionId": "uuid",
    "conversationStatus": "completed",
    "eventCursor": 42
  },
  "categoryId": "uuid"
}
```

Notes:

- Full structured conversation metadata is permission-projected and may be returned only by the authenticated Raw page/detail helper, not by public search/list projections.
- Search result page payloads must not expose private metadata to unauthorized users.

## Search

### `POST /api/v1/search/pages` (hybrid header search)

Existing input already accepts `space`. For this feature:

- `space='raw'` with readable Raw permissions allows keyword and semantic capabilities.
- Semantic capability is no longer restricted to wiki space.
- Semantic submission passes the selected `space` into the semantic action.
- Raw Conversation results are normal page results with:

```json
{
  "page": {
    "spaceSlug": "raw",
    "path": "conversations/2026/07/21/...",
    "title": "Conversation: ...",
    "kind": "native"
  },
  "excerpt": "...",
  "matchSources": ["keyword", "semantic"],
  "engineSources": ["full_text", "semantic"]
}
```

Opening the result navigates to `/spaces/raw/{path}`.

### `POST /api/v1/search/semantic`

Existing input already accepts `space`. For this feature:

- Scope validation checks the resolved target space, not the default wiki space.
- When `space` is omitted, candidates may include every space the caller can read.
- Unauthorized Raw candidates are removed before result counts and excerpts are formed.

## Capture Job Contract

Queue name: `raw-conversation-capture`

Payload:

```json
{ "actionId": "uuid" }
```

Behavior:

1. If data source disabled, mark action capture status `disabled` and exit.
2. Ensure built-in Conversation category exists.
3. Read action and events after `raw_conversation_last_event_id`.
4. Reconstruct a conversation view model.
5. Create or append the Raw Conversation page.
6. Reconcile active AI indexes for the page.
7. Update `ai_actions.raw_conversation_*` fields.

Idempotency:

- Re-running with no new events is a no-op.
- Duplicate queued jobs for the same action converge on one Raw page.

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `DATA_SOURCE_UNAVAILABLE` | 409 | Data source cannot operate in current mode |
| `RAW_CATEGORY_SYSTEM_PROTECTED` | 409 | Attempted to retire/delete/break a built-in category |
| `RAW_CONVERSATION_IMMUTABLE` | 409 | Attempted to delete Raw evidence through chat history |
| `RAW_CONVERSATION_CAPTURE_FAILED` | 500/422 | Capture failed; surfaced only to permitted operators |
