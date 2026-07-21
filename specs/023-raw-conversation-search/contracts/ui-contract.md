# Contract: UI Behavior

**Feature**: 023-raw-conversation-search

## Admin: Content Data Sources

Route: existing Admin settings area under Content. If the project already has a Content settings page, add a Data Sources section there; otherwise add the minimal Content settings route needed for this section.

Required behavior:

- Show Wiki AI Conversations as one data source row.
- Use a toggle for enabled/disabled state.
- Show unavailable state when Raw content is not available in the current writing mode.
- Persist changes through `PATCH /api/settings/content-data-sources/[sourceKey]`.
- Use existing Admin page layout, form controls, and localized copy.
- Do not add another navigation entry for the same feature if a Content settings page already exists.

## User Center: AI Chat History

Route: `/user-center/ai-sessions`

Required behavior:

- Legacy sessions continue to list and open as today.
- Captured sessions show the same status/date/question columns.
- Captured session "view" opens the Raw-derived conversation detail or links to the Raw page; both must use the shared conversation presentation.
- Captured session rows may include a Raw page affordance that opens `/spaces/raw/{path}`.
- Delete action must not imply hard deletion for captured Raw evidence. Disable, relabel, or replace with shortcut-removal behavior according to the API implementation.
- Continue/resume uses the canonical captured conversation view model when the session has a Raw Conversation page.

## Shared Conversation Renderer

Component target: `src/components/chat/ConversationSessionView.tsx`

Input view model:

```ts
type ConversationSessionViewModel = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'expired';
  question: string;
  answer: string;
  thinking: string;
  citations: AiCitation[];
  insufficient: boolean;
  errorMessage: string | null;
  queuedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
};
```

Display requirements:

- Match existing AI Chat History session detail for question, thinking, answer, citations, insufficient state, errors, and status.
- Keep page-level action buttons in the header where applicable; do not consume extra vertical reading space for duplicate controls.
- Use existing chat components (`ChatAnswer`, `ChatThinking`, `ChatCitations`) and UI primitives.
- Localize labels/statuses through existing i18n mechanism.

## Raw Conversation Page

Route: `/spaces/raw/{path}`

Dispatch rule:

- If the page's raw category has `systemKey='conversation'`, render with `ConversationSessionView`.
- Otherwise use the existing `RawContentRenderer`.

Required behavior:

- Breadcrumb and Raw page URL remain normal Raw reader behavior.
- The body presents conversation detail, not JSON or generic raw text.
- The latest Raw revision controls the displayed status/content.
- If structured conversation metadata is missing or invalid, fall back to rendered transcript text and show a non-sensitive notice to permitted users.
- Unauthorized users see not-found/forbidden behavior consistent with existing Raw page access.

## Search

Surfaces: header hybrid search and `/search` semantic search where applicable.

Required behavior:

- Raw Conversation results display a conversation label or equivalent source cue for permitted users.
- Opening a result navigates to `/spaces/raw/{path}`.
- No public/unauthorized user can see Raw Conversation result counts, excerpts, or paths.
- If semantic retrieval is pending/unavailable, keyword Raw Conversation results remain usable and the reduced-coverage state follows existing search UI behavior.

## Localization

Add keys for:

- Content Data Sources title/description.
- Wiki AI Conversations data source title/description/unavailable state.
- Conversation category/system labels where surfaced.
- Raw Conversation result label.
- Raw Conversation page fallback/invalid metadata notice.
- Captured-session delete/retention wording.
