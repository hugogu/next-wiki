# Quickstart: Raw Conversation Search

**Feature**: 023-raw-conversation-search | **Plan**: [plan.md](plan.md)

## Prerequisites

1. Local database is running through project Docker Compose.
2. AI text model and embedding model are configured.
3. Writing mode is LLM Wiki so Raw space is available.
4. An Admin account exists.
5. An active AI index exists or can be rebuilt.

Suggested setup:

```bash
docker compose up -d --build
pnpm db:migrate
pnpm --filter @next-wiki/web test
```

If schema changes are made during implementation:

```bash
pnpm db:generate
pnpm db:generate
```

The second run must report no schema changes. Never hand-author Drizzle migration SQL.

## Scenario 1: Configure Wiki AI Conversations Source

1. Sign in as Admin.
2. Open Admin Content settings.
3. Find Data Sources.
4. Verify Wiki AI Conversations is visible.
5. Toggle it off.
6. Ask a Wiki AI question and wait for completion.
7. Verify no Raw Conversation page is created.
8. Toggle it on.
9. Ask a new Wiki AI question.
10. Verify a Raw page appears under the Raw space and is assigned to the built-in Conversation category.

Expected:

- Source is disabled by default on existing deployments.
- Enabling/disabling affects future conversations only.
- Built-in Conversation category exists and cannot be retired/deleted.

## Scenario 2: Capture Running and Terminal Conversations

1. Enable Wiki AI Conversations.
2. Ask a Wiki AI question that streams a non-trivial answer.
3. While it is running, open AI Chat History or the Raw page link if available.
4. Wait for the answer to complete.
5. Refresh the Raw page.

Expected:

- Running state and partial retained content are visible once capture worker runs.
- Completed state appears after terminal capture.
- Raw page latest revision contains a readable transcript.
- Conversation renderer shows question, answer, thinking when retained, citations, insufficient state, and errors consistently with AI Chat History detail.

## Scenario 3: Search Finds Raw Conversations

1. Enable Wiki AI Conversations.
2. Ask a question containing a unique phrase.
3. Ensure capture completed.
4. Rebuild or reconcile the AI index if no active index exists.
5. Search from a permitted Admin session using exact words.
6. Search using semantically related wording.
7. Open the result.

Expected:

- Keyword results include the Raw Conversation page.
- Semantic results can include the Raw Conversation page when semantic retrieval is available.
- Result opens `/spaces/raw/{conversation-path}`.
- The Raw page renders with the conversation-specific view.

## Scenario 4: Permission Safety

1. Capture a Raw Conversation as Admin.
2. Sign out or sign in as a non-Admin user without Raw read access.
3. Search for exact terms from the captured conversation.
4. Try opening the Raw page URL directly.

Expected:

- Search returns no Raw Conversation result, excerpt, count, or metadata.
- Direct open does not disclose the page.
- Admin can still find and open the same page.

## Scenario 5: Legacy History Is Not Migrated

1. Create or identify an AI Chat History record that predates enabling the source.
2. Enable Wiki AI Conversations.
3. Open AI Chat History.
4. Search Raw space for that legacy conversation text.

Expected:

- Legacy record remains available through existing history behavior until normal retention applies.
- No Raw Conversation page is created for the legacy record.
- Raw search is not required to find legacy-only history.

## Scenario 6: Captured Session Delete Semantics

1. Capture a new conversation as Raw.
2. Open AI Chat History.
3. Attempt the row's delete/removal action.
4. Open the Raw page URL as Admin.

Expected:

- UI does not claim that Raw evidence will be hard-deleted.
- Raw page remains available unless normal Raw retention rules say otherwise.
- Legacy-only records may keep existing delete behavior.

## Verification Commands

Focused tests expected from implementation:

```bash
pnpm --filter @next-wiki/web test -- raw-conversations
pnpm --filter @next-wiki/web test -- content-data-sources
pnpm --filter @next-wiki/web test -- ai-actions
pnpm --filter @next-wiki/web test -- search
pnpm --filter @next-wiki/web test:e2e
pnpm --filter @next-wiki/web openapi:generate
```

Final implementation should also run the repository's normal lint/build checks:

```bash
pnpm lint
pnpm build
```

## Manual Verification Notes (implementation pass, 2026-07-21)

Full automated suite: `pnpm vitest run` — 2987 passed, 1 pre-existing skip, 0
failures. `pnpm lint`, `pnpm --filter @next-wiki/web typecheck`, and
`pnpm build` all clean. `pnpm openapi:generate` regenerated with no drift
(`openapi-schemas.test.ts` structural-sync suite: 1725/1725).

Scenario-by-scenario status:

- **Scenario 1 (Configure source)**: Verified end-to-end via Playwright
  (`e2e/raw-conversation-search.spec.ts`, "admin toggles the Wiki AI
  Conversations data source") — disabled by default, toggles persist across
  reload, and via service tests that enabling/disabling only affects actions
  created after the change.
- **Scenario 2 (Capture running/terminal conversations)**: This dev/e2e
  environment has no live LLM provider configured (matches the existing
  `ai-curation-search.spec.ts` constraint), so the real
  question → streaming → capture path cannot run against a live model here.
  Verified instead at the level that constraint allows: `raw-conversations.ts`
  unit/integration tests cover reconstruction from partial/complete event
  logs, idempotent create/append, concurrent-duplicate-job convergence, and
  the pre-purge final-capture path in `ai-cleanup.test.ts`. The Playwright
  spec seeds a fully-captured conversation (same shape `captureConversation`
  writes) and confirms the Raw page renders it through
  `ConversationSessionView`, not a generic dump — this caught and fixed a
  real bug (`ConversationSessionView.tsx` was missing `'use client'`, which
  only surfaces when actually rendered by the Next.js server, not in Vitest's
  `renderToStaticMarkup`).
- **Scenario 3 (Search finds Raw Conversations)**: Verified end-to-end
  (Playwright: "an Admin can find a captured conversation via Raw-space
  search and open it") plus unit coverage of the space-aware
  coordinator/candidate-projection/ai-retrieval changes.
- **Scenario 4 (Permission safety)**: Verified end-to-end (Playwright: "a
  non-Admin cannot discover or open a captured conversation" — search returns
  no candidate and direct navigation 404s) plus unit coverage of
  `readPermissionFilteredVectorCandidates`/`requireSemanticSearchScope`
  target-space resolution.
- **Scenario 5 (Legacy history not migrated)**: No migration/backfill code
  exists; legacy `ai_actions` rows never receive `raw_conversation_page_id`
  and continue through the unchanged event-log detail path. Covered by
  `ai-actions.test.ts`'s captured-vs-legacy list/detail tests.
- **Scenario 6 (Captured session delete semantics)**: Verified end-to-end
  (Playwright: delete button disabled + "Open Raw page" link present for a
  captured row) plus a service test asserting `deleteSession` rejects with
  `RAW_CONVERSATION_IMMUTABLE` for captured sessions while leaving the
  pointer and Raw page intact.

No open issues at implementation time.
