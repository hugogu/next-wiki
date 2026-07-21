# Quickstart: Feishu Bot Conversation Capture

**Date**: 2026-07-21 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](./spec.md) | **Contracts**: [api-delta](./contracts/api-delta.md) | [ui](./contracts/ui-contract.md)

A runnable, end-to-end validation script for the unified AI Conversations capture path. It proves the user's stated goal — "the conversation search should work after that" — and exercises every requirement labeled P1 / measurable (`SC-001`…`SC-010`).

## Prerequisites

- `pnpm install` (already done)
- A running PostgreSQL via `docker compose up -d postgresql` (or the canonical `docker compose up -d --build` for the full stack).
- `pnpm --filter @next-wiki/web db:migrate` has applied the latest schema. (No new migration is shipped by this feature.)
- Two wiki users — Admin and a bound Reader whose password and ID you know.
- The Feishu integration is configured (`/admin/feishu`) and a Feishu binding exists for the Reader. (See 019 quickstart for the binding flow.)
- An AI provider is configured (`/admin/ai`) with chat-assignments ready. (See 004 quickstart.)
- `RAW_PAGES_DIRECTORY` is on the persistent volume (existing default).

## 1. Verify the renamed Data Source appears under Bots General

As Admin, open `/admin/bots?tab=general` and confirm the General tab shows one Data Sources row named `AI Conversations`. The former Content settings Data Sources location must not show a second writable editor for the same source; it should redirect, link, or otherwise route Admins to Bots General.

Then verify the backend settings API still exposes the canonical source:

```bash
curl -sS -b "$ADMIN_COOKIE" http://localhost:3000/api/settings/content-data-sources
```

Expected response (after rename deployed):

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
      "updatedAt": "<ISO timestamp>"
    }
  ]
}
```

`SC-009` — Admin can locate and toggle the renamed Data Source under Bots' General settings, with no duplicate writable Content settings entry.

## 2. Enable capture for every channel

```bash
curl -sS -b "$ADMIN_COOKIE" -X PATCH \
  -H 'Content-Type: application/json' \
  -d '{"enabled": true}' \
  http://localhost:3000/api/settings/content-data-sources/ai-conversations
```

Verify `enabled: true` returned.

## 3. Run a Wiki AI web capture (control test)

Sign in as the Reader and open the wiki chat side pane. Ask: "What is the canonical path of the welcome page?" Wait for a grounded answer. Then:

```bash
curl -sS -b "$READER_COOKIE" "http://localhost:3000/api/ai/sessions?limit=1"
```

Expected: each returned session carries a `rawConversation.channel` that resolves to `'wiki-ai'`. Open the page `path` from the response and confirm the reader renders identically to a normal Conversation page.

`SC-001` first half, `SC-006` web-capture half — pass.

## 4. Run a Feishu Q&A capture

Using the Feishu-bound Reader identity, send a private 1:1 message to the wiki bot: "summarize our recent retrieval policy in one sentence".

- Wait for the bot's reply in Feishu.
- Open the Reader's `/api/ai/sessions?limit=1` and verify:
  - `rawConversation.channel` is `'feishu'`.
  - `rawConversation.url` matches the conversation URL you can also open from `Search`.

`SC-001` Feishu half — one Raw page for the captured Feishu turn — pass.

## 5. Verify the captured Feishu turn is searchable via Raw search

Wait up to 2 minutes for the capture worker and indexing to settle. As the Reader:

```bash
curl -sS -b "$READER_COOKIE" \
  --data-urlencode 'q=<unique phrase from the Feishu answer>' \
  --data-urlencode 'space=raw' \
  'http://localhost:3000/api/search'
```

Expected: the response includes the Raw Conversation page whose `path` matches step 4's `rawConversation.url`. The result row carries the "Feishu" badge per the UI contract.

`SC-003`, `SC-004`, `SC-006` Feishu half — pass.

## 6. Run a group @-mention with multiple bound users in the same chat

Have two bound Readers in one Feishu group chat. Reader A asks the bot first; then Reader B asks a follow-up.

- Verify the bot's answers land in DM (per 019 FR-024); group shows no protected metadata.
- Verify each Reader, looking at their own `/api/ai/sessions`, only sees their own captured turns.
- Reader B trying to fetch Reader A's `rawConversation.pageId` directly returns `404 not_found` per the Raw read permission check.

`SC-005`, `SC-007` — pass.

## 7. Disable capture; both channels should still answer but produce no Raw page

As Admin:

```bash
curl -sS -b "$ADMIN_COOKIE" -X PATCH \
  -H 'Content-Type: application/json' \
  -d '{"enabled": false}' \
  http://localhost:3000/api/settings/content-data-sources/ai-conversations
```

Send a new Wiki AI question and a new Feishu question from the bound Reader. The bot answers both, but:

- Wiki AI capture: the new `ai_actions` row has `rawConversationCaptureStatus='disabled'`.
- Feishu capture: same `rawConversationCaptureStatus='disabled'`.
- Neither produces a new Raw page.

`SC-002` — pass.

## 8. Re-enable and verify the toggle state persisted across the rename window

For deployments that had capture enabled before this feature shipped, the lazy migration must have promoted the legacy `wiki-ai-conversations` row to the new key. Verify by checking that:

```bash
curl -sS -b "$ADMIN_COOKIE" \
  http://localhost:3000/api/settings/content-data-sources/ai-conversations
```

returns `enabled: true` if the previous deployment state was enabled. The legacy row, if any, does not appear in the list.

`SC-009` rename preserves state — pass.

## 9. Audit channel marker is `feishu` for Feishu captures

Look at the audit log for the captured Feishu turn from step 4 (Admin-only):

```bash
curl -sS -b "$ADMIN_COOKIE" \
  "http://localhost:3000/api/audit?origin=feishu&action=capture_raw_conversation&limit=5"
```

Expected entries:

- `origin: 'feishu'`
- `actorUserId: <bound Reader id>`
- `correlationId` (opaque), no raw question/answer/credential text
- a captured conversation identifier (page id), no transcript body

`SC-008` — pass.

## 10. Permission isolation for non-readable users

As a third wiki user (Admin can synthesize one with a `Reader` role and no Raw read access):

```bash
curl -sS -b "$OTHER_COOKIE" \
  --data-urlencode 'q=<unique phrase from the Feishu answer>' \
  --data-urlencode 'space=raw' \
  'http://localhost:3000/api/search'
```

Expected response: zero Raw Conversation results, no excerpt, no count, no metadata. Direct fetch of the page id returns `404 not_found`.

`SC-005` — pass.

## 11. Replay a Feishu inbound event

Drive the Feishu transport double with the same inbound event twice (019 quickstart covers the test double). Verify:

- exactly one `wiki_question` `ai_actions` row is created
- exactly one `feishuBotSessions` row is upserted (session window preserved)
- exactly one Raw Conversation page is captured for the replayed turn
- the bot's reply is delivered exactly once to the user

`SC-007` — pass; `FR-023` — pass.

## 12. Termination on unbind preserves the captured Raw page under retention

Unbind the Feishu identity of the Reader used in step 4.

- The active `feishuBotSessions` row is marked `'expired'`.
- The captured Raw page remains.
- Direct fetch of the page id by the (now-unbound) user returns `404` per Raw read permission check.
- Direct fetch by Admin (or by a new binding with the same user) returns the captured page as before.

`SC-005`, `FR-014` — pass.

## Expected test outcome

After running all 12 steps with no manual interventions:

| Success criterion | Step(s) |
|---|---|
| `SC-001` Feishu half — Feishu Q&A produces exactly one Raw page for each captured turn | 4, 11 |
| `SC-002` — disabled source produces no Raw page | 7 |
| `SC-003` — captured Feishu conversation keyword-searchable within ~2 min | 5 |
| `SC-004` — semantic search returns the captured page in top 5 | 5 (semantic variant) |
| `SC-005` — restricted user sees zero results / counts / excerpts | 6, 10, 12 |
| `SC-006` — same reader renders for both channels | 3, 4 |
| `SC-007` — one canonical durable record per turn | 6, 11 |
| `SC-008` — audit origin `feishu` and bound user | 9 |
| `SC-009` — Admin can locate and toggle the renamed Data Source under Bots General with no duplicate Content editor | 1, 2, 8 |
| `SC-010` — multi-turn session continues the same Bot Session wrapper, multiple Raw pages | 6, 11 |

## Tear down

```bash
docker compose down
```

Captured Raw Conversation pages persist inside the persistent volume for retention-window inspection if needed; the next run will resume from the same state.
