# Contract: UI Contract

**Feature**: 025-feishu-bot-conversation-capture

UI changes are limited to:

1. Renaming the Admin Content Data Sources label from "Wiki AI Conversations" to "AI Conversations" and updating its description to mention every bot channel.
2. Surfacing a `channel` marker on the AI Chat History detail view and on admin-only metadata views of a Raw Conversation page.

No new routes, no new navigation entries, no duplicate feature entry points.

## Admin Content Data Sources

The Data Sources panel under Content (`apps/web/src/components/admin/ContentDataSourcesPanel.tsx`, as referenced by 023) renders one row per registered source. After the rename:

- Label: "AI Conversations"
- Description: "Capture every AI conversation — Wiki AI and Feishu bot — as Raw Conversation pages."
- Toggle behavior unchanged: clicking the toggle issues a `PATCH /api/settings/content-data-sources/ai-conversations` with `{ enabled: true | false }`.

The Admin UI never surfaces the legacy `'wiki-ai-conversations'` key. State is preserved automatically.

## AI Chat History Detail

The existing `ConversationSessionView` component (referenced in 023, rendered for both web captures and Feishu captures via `apps/web/src/components/chat/ConversationSessionView.tsx`) is used unchanged. When the pointer's `channel` is `'feishu'`, the panel can render a small badge such as "Feishu" near the conversation header for traceability. The badge:

- is read from the typed `RawConversationPointer.channel` field
- has no interaction; it is a label only
- is localized through the i18n keys `chat.history.feishuBadge.label` (`en.json` and `zh.json`)
- is omitted entirely when `channel` is absent or equals `'wiki-ai'`

This is a visual-only addition; the reader layout itself is unchanged and the existing labels, status, citations, errors, and timestamps render identically.

## Raw Conversation Page

The Raw Conversation reader (referenced in 023 under `apps/web/src/components/pages/raw-content/RawContentRenderer.tsx`) is unchanged in layout. Admin-only metadata surfaces that already show `source_metadata` simply gain the `channel` field. Public readers and authenticated readers see the same page; the channel marker is metadata only.

## Search Result Preview

The header hybrid search result preview (017 + 013) already supports Raw Conversation pages. When a search result is a Raw Conversation page with `channel='feishu'`, the result row's small label area shows a "Feishu" chip; `channel='wiki-ai'` or absent shows no chip. The chip uses the same i18n key as the Chat History detail badge.

## Feishu Admin Surfaces

The Feishu integration admin pages are unchanged. The renamed Data Source label is the only first-party UI exposure of this feature. Bot Session views remain unchanged.

## URL Surface

No URL changes. Every captured Feishu conversation shares the same URLs as every captured web conversation:

- `/spaces/raw/conversations/...` for the Raw Conversation page (canonical entry point)
- `/api/ai/sessions/{id}` for the first-party AI session detail
- The existing search-result deeplink that already routes to the Raw page

No duplicate entry points. Breadcrumbs derived from `(space, path)` continue to work for both web and Feishu captures.

## Accessibility

The new "Feishu" badge is rendered as a non-interactive decorative span; it does not introduce new focus targets. Screen readers announce it as "Feishu" (English) or "飞书" (Simplified Chinese) via the i18n string, after the conversation status label.

## Empty / Failure States

No new empty states. The existing 023 reader empty states cover both web and Feishu captures because they share the same render pipeline. If a Feishu capture fails (`rawConversationCaptureStatus='failed'`), the existing capture-failed surface renders identically with an admin-only diagnostic in metadata.
