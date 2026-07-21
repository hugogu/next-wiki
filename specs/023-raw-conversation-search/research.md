# Research: Raw Conversation Search

**Date**: 2026-07-21 | **Plan**: [plan.md](plan.md)

## D1: Content data sources use an explicit registered settings table

**Decision**: Add a `content_data_source_settings` table keyed by stable source key, beginning with `wiki-ai-conversations`, and expose it through Content > Data Sources.

**Rationale**: The spec says data sources may grow beyond chat history. A key-addressed table lets future sources add settings without changing a singleton JSON blob every time, while still keeping explicit registration in code. The source row is site-wide, small, and fits the existing singleton/settings patterns.

**Alternatives considered**:

- Store the flag in `site_settings`: too broad and turns Content data sources into an untyped JSON bucket.
- Add a dedicated `wiki_ai_conversation_capture_enabled` column: simple now, but makes the next data source another schema change and UI special case.

## D2: Built-in Conversation category is protected by `raw_categories.system_key`

**Decision**: Extend `raw_categories` with nullable `system_key`, unique when present. The built-in category uses `system_key='conversation'`, name `Conversation`, slug `conversation`, and cannot be deleted, retired, or reassigned in a way that breaks capture.

**Rationale**: Existing raw categories are user-managed and can be renamed, retired, or deleted when unused. Wiki AI conversation capture needs a stable filing target and renderer selector. A system key gives stable semantics without creating a second category table.

**Alternatives considered**:

- Match by category name or slug: fragile under rename/localization and hard to protect cleanly.
- Add a separate raw content type table: unnecessary; the category already expresses the filing dimension the spec requires.

## D3: New captured sessions use Raw pages as canonical history, while `ai_actions` remains execution metadata

**Decision**: Keep `ai_actions` / `ai_action_events` for job execution, streaming, cancellation, and legacy history fallback. For captured conversations, add pointer/cursor fields on `ai_actions` to the Raw page and last captured event; do not create a new chat-history table.

**Rationale**: `ai_actions` already owns queued/running/finished action lifecycle and event retention. Raw pages should become the durable history/search record, but the system still needs action status and streaming events while the action runs. Pointer fields avoid a duplicate history store while making list/detail joins efficient and less brittle than JSON-only metadata.

**Alternatives considered**:

- Replace `ai_actions` with pages for all chat lifecycle: too risky because action execution, cancellation, retention cleanup, and provider metadata already depend on `ai_actions`.
- Store Raw page id only in `result_metadata`: no migration table, but fragile because finish handlers currently replace result metadata and querying JSON for history lists is awkward.

## D4: Capture runs through a coalesced pg-boss job, not per-token synchronous page writes

**Decision**: Register a `raw-conversation-capture` queue. Wiki AI event append/finish paths enqueue or coalesce capture work; the worker reconstructs the session up to the latest event cursor and creates/appends a Raw Conversation revision idempotently.

**Rationale**: AI answers stream many `text_delta` events. Writing a Raw revision for each token would hurt chat latency and create noisy history. A worker keeps request handlers light, satisfies async-first rules, and can coalesce high-frequency events while still making running conversations visible.

**Alternatives considered**:

- Synchronous raw append from `appendActionEvent`: simplest but couples chat streaming latency to page/revision writes and indexing.
- Terminal-only capture: simpler, but fails the requirement that running chats can be opened as Raw pages with current state.

## D5: Raw Conversation revisions store transcript text for retrieval and structured metadata for rendering

**Decision**: The Raw revision `content_source` stores a normalized transcript text/Markdown projection used by keyword search and embeddings. The revision `source_metadata` stores compact structured conversation metadata (schema version, action id, status, event cursor, question, answer, thinking, citations, insufficient/error state, timestamps) used by the Conversation renderer.

**Rationale**: Existing lexical search and AI indexing read `page_revisions.content_source`; putting human-readable transcript text there makes Raw Conversation search useful without a new index field. The renderer needs structure to match AI Chat History detail, so the same reconstructed view model is stored in revision metadata rather than reparsing a transcript.

**Alternatives considered**:

- Store the full event log JSON as `content_source`: easy to preserve, but poorer keyword/vector quality and noisy excerpts.
- Store only Markdown transcript: good for search, but loses reliable citations/status/thinking structure after `ai_action_events` expire.
- Add a separate conversation snapshot table: violates the no duplicate history-table direction.

## D6: Conversation display is extracted into a shared view component

**Decision**: Extract the current AI session detail body into a reusable `ConversationSessionView` that accepts a reconstructed conversation view model. AI Chat History detail and Raw Conversation pages both use it.

**Rationale**: The user explicitly asked not to build a separate display. A shared component keeps answer/thinking/citation/error rendering identical and makes future chat UI changes apply to both surfaces.

**Alternatives considered**:

- Keep the modal implementation and duplicate it for Raw pages: likely to drift.
- Render Raw Conversation as generic JSON/text: searchable but not readable enough for session review.

## D7: Hybrid semantic search must become space-aware for Raw

**Decision**: Remove the current `space.kind === 'wiki'` semantic limitation in `hybridSearchPages`, pass the selected `space` through `public-ai` and semantic actions, and make semantic search scope checks use the resolved target space instead of the default wiki space.

**Rationale**: Current code already has per-candidate permission filtering in `ai-retrieval`, but the header hybrid path disables semantic retrieval outside wiki and `public-ai` checks default-space read scope. Raw Conversation search requires semantic retrieval over raw pages while still denying unauthorized users before returning candidates.

**Alternatives considered**:

- Keep Raw Conversation search lexical-only: violates the embedding/search requirement.
- Create a dedicated Raw semantic endpoint: fragments the existing search architecture and duplicates permission logic.

## D8: Raw entry create/append must reconcile active AI indexes

**Decision**: Ensure raw entry create/append paths used by capture call `reconcilePageAcrossIndexes` after committing a published Raw revision, or route through a public-content helper that does so.

**Rationale**: Current normal page publish/update paths reconcile index state, but `raw-entries.ts` creates and appends published revisions without calling `reconcilePageAcrossIndexes`. Without this, captured conversations would not become searchable in an already-active index until a manual rebuild.

**Alternatives considered**:

- Require manual full rebuild after enabling capture: operationally poor and misses the 2-minute discoverability criterion.
- Add a new embedding job only for conversations: unnecessary; the existing derived page index is the correct projection.

## D9: Deletion in AI Chat History becomes a shortcut-removal concern for captured sessions

**Decision**: For captured sessions, do not hard-delete the Raw page. The history delete action should either be disabled/relabeled for captured sessions or remove only the user-center shortcut/association while preserving append-only Raw evidence.

**Rationale**: Existing `DELETE /api/ai/sessions/[id]` hard-deletes `ai_actions` and cascaded events. Captured Raw pages are evidence records and must follow Raw retention rules. The UI must avoid implying that a user action deletes Raw evidence.

**Alternatives considered**:

- Hard-delete the Raw page too: violates Raw append-only retention.
- Keep hard-deleting `ai_actions` while leaving Raw page orphaned: loses resume/status linkage and confuses history.

## D10: No historical migration

**Decision**: Do not backfill pre-feature `ai_actions` into Raw pages. Legacy records continue through the existing AI history UI until their normal retention behavior applies.

**Rationale**: The spec explicitly excludes historical migration. Backfilling old event logs would also be incomplete for expired inputs/events and could unexpectedly expand retention/search exposure.

**Alternatives considered**:

- Opportunistic migration of non-expired sessions: creates mixed behavior and hidden retention changes.
- Admin-triggered import now: useful later, but outside 023 scope.
