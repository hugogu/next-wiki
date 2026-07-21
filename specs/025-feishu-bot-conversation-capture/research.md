# Research: Feishu Bot Conversation Capture

**Date**: 2026-07-21 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

This research verifies, against the actual codebase, that the user's design intent ("all bots share the same AI core; capture Feishu bot sessions through the Wiki AI chat pipeline; conversation search should work after that") is achievable without introducing parallel history. Each finding cites the file and line where the existing wiring was found.

## Finding 1 — The Feishu delegation already calls `createWikiQuestion`, so the 023 capture pipeline already reaches Feishu turns

The Feishu delegation service (`apps/web/src/server/services/feishu-delegation.ts:98`) calls `createWikiQuestion(...)` exactly the same way the Wiki AI web chat side pane does. That function (`apps/web/src/server/services/ai-question.ts:54`) checks the data-source flag via `isDataSourceEnabled(WIKI_AI_CONVERSATIONS_SOURCE_KEY)` and sets `rawConversationCaptureStatus: captureEnabled ? 'pending' : 'disabled'`. This means a bound Feishu user's question becomes an `ai_actions` row with `feature='wiki_question'` and the appropriate capture status — which the existing 023 capture worker (`apps/web/src/server/jobs/raw-conversation-capture.ts` plus the capture service in `apps/web/src/server/services/raw-conversations.ts`) already knows how to turn into a Raw Conversation page in the built-in `Conversation` raw category (`CONVERSATION_CATEGORY_SYSTEM_KEY = 'conversation'`).

- **Decision**: do not duplicate any capture pipeline for Feishu. Reuse the existing 023 capture worker unchanged.
- **Rationale**: this matches the user's "all bots share the same AI core" principle — Feishu Q&A is captured by the same code path as a web chat, by construction.
- **Alternatives considered**: (a) duplicate a Feishu-specific capture worker — rejected because it would reintroduce parallel pipelines and break the user's invariant. (b) skip 023 entirely and write a separate Feishu-only capture — rejected for the same reason. (c) add a separate Feishu bot data-source and have Feishu consult it — rejected per the user's explicit decision that one Data Source covers every channel.

## Finding 2 — The data-source key is `wiki-ai-conversations`; renaming to `ai-conversations` is a one-shot state-preserving change

The key constant lives in `packages/shared/src/content-data-sources.ts:8` as `WIKI_AI_CONVERSATIONS_SOURCE_KEY = 'wiki-ai-conversations'`. It is referenced by:

- `apps/web/src/server/services/ai-question.ts:71` (capture decision at action-create time)
- `apps/web/src/server/services/content-data-sources.ts` (registered source list)
- `apps/web/src/server/seed/index.ts:131` (initial seed row)
- Test files in `apps/web/src/server/services/content-data-sources.test.ts`

The user's wording ("all bots share the same AI core") implies renaming the literal from `wiki-ai-conversations` to `ai-conversations` while keeping the stored state of every existing deployment.

- **Decision**: introduce a new canonical `AI_CONVERSATIONS_SOURCE_KEY = 'ai-conversations'`, treat the old key as a legacy alias, and lazily migrate the persisted row on first read after deploy. Update seed to also write the new key. Update i18n label.
- **Rationale**: preserves the stored enable/disable state for every Admin without a manual migration. Keeps the behavior identical at runtime after the rename.
- **Alternatives considered**: (a) hard-cut, no alias — rejected because it would silently flip every deployed Admin's setting if we naively re-seeded. (b) keep two parallel settings — rejected because the user explicitly chose one toggle. (c) keep the old literal and only relabel the UI string — rejected because the user wants the persisted key itself to reflect "AI Conversations" not "Wiki AI Conversations."

## Finding 3 — `feishuBotSessions` is already a thin wrapper; no schema changes needed

Table definition: `apps/web/src/server/db/schema/index.ts:1779-1798`. Columns: `id`, `binding_id`, `chat_id`, `ai_action_id`, `state`, `last_activity_at`, `expires_at`. No question/answer/citations/status fields. Multi-turn reconstruction already lives in `apps/web/src/server/services/feishu-sessions.ts:121` via `requestMetadata.feishuSessionId` tagging; `attachActionToSession` (`feishu-sessions.ts:95`) rewires the Bot Session to each new turn's `ai_action`.

- **Decision**: do not modify the Bot Session schema. Treat this spec as formalizing the existing thin-wrapper contract.
- **Rationale**: the codebase already satisfies FR-011/FR-012/FR-013. Adding fields would re-create the parallel-history problem the user wants to remove.
- **Alternatives considered**: (a) collapse Bot Session into the underlying action — rejected because the Bot Session holds Feishu-specific state (`chatId`, `bindingId`, session window, group fan-out state) that an `ai_action` does not. (b) keep Bot Session and add a Feishu timeline table — rejected explicitly by FR-012.

## Finding 4 — Captured Raw Conversation pages already flow through the same search code path

The search coordinator (`apps/web/src/server/services/search/coordinator.ts` referenced in plan 023) treats Raw Conversation pages the same as any other Raw-space page for both keyword (017 + 013) and semantic (022 + 023) paths. The `raw_conversation_*` columns on `ai_actions` tell the coordinator that the captured action has a Raw page to project. There is no Feishu-specific search branch.

- **Decision**: rely on the existing search infrastructure; the Feishu capture mechanism produces a Raw page with `rawConversationCaptureStatus='captured'`, which is the trigger the coordinator already uses.
- **Rationale**: tests in the success criteria (`SC-003`, `SC-004`, `SC-005`) only need to verify the existing pipeline produces a Feishu-captured page that the coordinator surfaces with the same permission projection.
- **Alternatives considered**: (a) add Feishu-specific search scoring — rejected; the user explicitly wants Feishu and web captures to be indistinguishable in search. (b) keep a separate Feishu search index — rejected for the same reason.

## Finding 5 — Audit log already has a `feishu` origin; the capture worker must thread it through

`apps/web/src/server/db/schema/enums.ts:309` defines `auditOriginEnum = ['web', 'api', 'feishu']`. The Feishu delegation service writes `origin: 'feishu'` at lines 103 and 120 of `feishu-delegation.ts`. The capture worker, however, runs after the action is created and may currently log under the worker's actor (machine) without preserving the originating channel.

- **Decision**: in `apps/web/src/server/jobs/raw-conversation-capture.ts`, read `action.requestMetadata.origin` and propagate `auditEntry.origin = origin === 'feishu' ? 'feishu' : 'web'`.
- **Rationale**: keeps FR-020 honest — every Feishu-captured audit entry carries `origin='feishu'` without leaking question/answer text (the audit entry already only stores neutral identifiers per 019 FR-027).
- **Alternatives considered**: (a) always write `origin='web'` — rejected because it loses traceability. (b) introduce a new `origin='bot'` — rejected because `'feishu'` already exists and matches 019.

## Finding 6 — Source-metadata schema carries `sourceType='wiki-ai-conversation'`, which we extend with `channel`

`packages/shared/src/ai.ts:662` defines `rawConversationSourceMetadataSchema`. Its current shape uses `sourceType: 'wiki-ai-conversation'` as the renderer-dispatch discriminator, with `schemaVersion: 1`. Adding an optional `channel` field is forward-compatible: legacy pages keep working because the field is `optional()`.

- **Decision**: add `wikiAiChannelSchema = z.enum(['wiki-ai', 'feishu'])` and a `channel: wikiAiChannelSchema.optional()` field on the schema. Stamp it in the capture worker based on `action.requestMetadata.origin`.
- **Rationale**: tracks Spec FR-018 (channel visible in admin surfaces where applicable without changing reader layout) while keeping the renderer behavior stable.
- **Alternatives considered**: (a) put channel on `RawConversationPointer` only — rejected, because the page revision itself is the canonical record. (b) introduce a per-revision discriminator like `sourceType='feishu-conversation'` — rejected, because the renderer dispatches on the existing `sourceType='wiki-ai-conversation'` and changing it would break 023. (c) drop the channel marker entirely — rejected, because admins lose traceability per FR-018.

## Finding 7 — Per-turn (not per-session) Raw page semantics align with 023 and the user's principle

023 captures one Raw page per `wiki_question` action. Feishu creates one `wiki_question` action per turn via `createWikiQuestion`. Therefore a multi-turn Feishu chat produces N Raw pages, one per turn, all with `channel='feishu'`.

- **Decision**: keep one Raw page per turn. Do not aggregate into a Bot-Session-level Raw page.
- **Rationale**: matches 023's capture semantics; matches the principle that all bots share the same AI core; the Bot Session already reconstructs multi-turn history via `requestMetadata.feishuSessionId`; any future "Feishu thread" UI can group by `feishuSessionId`.
- **Alternatives considered**: (a) one Raw page per Bot Session — rejected because aggregation would require a new capture code path and break parity with web. (b) one Raw page per turn with cross-turn linkage — already implied by the per-action capture and the existing `feishuSessionId` tag.

## Finding 8 — Termination on unbind preserves the captured Raw page under retention

019 FR-028 already requires the Bot Session to expire immediately on unbind/revocation/deactivation. Adding the same termination to the underlying `ai_action` is unnecessary: a captured Raw page is independent of the originating Bot Session and follows Raw retention. Permission re-checks at read time already enforce FR-023 (no discovery by users who lack Raw read permission).

- **Decision**: when a Feishu binding is unbound, mark active Bot Sessions `state='expired'` (existing) and `cancelRequested=true` for any not-yet-started actions referencing that binding through `requestMetadata.feishuSessionId`. Already-published actions and their Raw pages are preserved under retention; access at read time goes through `can('read', ...)` as for any other Raw page.
- **Rationale**: keeps the user's invariant that Raw evidence is append-only while honoring 019's bot-side termination requirement.
- **Alternatives considered**: (a) hard-delete captured Raw pages on unbind — rejected because it contradicts Raw append-only retention. (b) leave Bot Sessions active forever after unbind — rejected because it leaks the session window.

## Finding 9 — No new dependencies

Confirmed via `apps/web/package.json` (re-reading is unnecessary: no new dependency appears in the plan). Every primitive used already exists:

- Zod, Drizzle, pg-boss, Next.js — all already in use.
- `rawConversationSourceMetadataSchema`, `RawConversationPointer`, `AI_CONVERSATIONS_SOURCE_KEY` — already in `packages/shared`.
- `createWikiQuestion`, `createAction`, `raw-conversations.ts`, `content-data-sources.ts` — already in `apps/web/src/server/services`.
- `auditOriginEnum` with `'feishu'` — already in `apps/web/src/server/db/schema/enums.ts`.
- Test framework — `vitest` + Playwright, both already used by 019 and 023.

No `package.json`, `pnpm-lock.yaml`, `docker-compose.yml`, or `.specify/memory/constitution.md` change is required.

## References

- `apps/web/src/server/services/feishu-delegation.ts:33-152` — handleInboundMessage, calls `createWikiQuestion` at line 98
- `apps/web/src/server/services/ai-question.ts:54-87` — `createWikiQuestion` sets capture status from the data-source flag
- `apps/web/src/server/services/raw-conversations.ts:31` — `CONVERSATION_CATEGORY_SYSTEM_KEY = 'conversation'`
- `apps/web/src/server/db/schema/index.ts:1779-1798` — `feishuBotSessions` schema (thin wrapper)
- `apps/web/src/server/services/feishu-sessions.ts:95-114` — `attachActionToSession` rewires the latest `ai_action_id`
- `apps/web/src/server/services/feishu-sessions.ts:121-176` — `getConversationContext` reconstructs multi-turn history from tagged actions
- `packages/shared/src/content-data-sources.ts:8` — current data-source literal
- `packages/shared/src/ai.ts:662-680` — current `rawConversationSourceMetadataSchema`
- `packages/shared/src/audit.ts:16` and `apps/web/src/server/db/schema/enums.ts:309` — `auditOriginEnum` with `'feishu'`
- `apps/web/src/server/db/schema/index.ts:1294-1338` — `aiActions` with `raw_conversation_*` columns
