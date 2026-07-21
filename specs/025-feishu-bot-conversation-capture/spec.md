# Feature Specification: Feishu Bot Conversation Capture

**Feature Branch**: `025-feishu-bot-conversation-capture`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "All bots should share the same AI core and so do interactions (including conversations). Capture Feishu bot sessions by having the bot reuse the Wiki AI chat pipeline, and the conversation search should work after that."

**Depends on**: 004-system-ai-support (Wiki AI records and AI actions), 019-feishu-bot (Feishu binding, Bot Session, fan-out and rate limit infrastructure), 022-llm-wiki-mode (raw space, raw categories, raw reader, and raw search permissions), 023-raw-conversation-search (Raw Conversation capture pipeline, built-in Conversation category, Conversation Data Source toggle, Raw-aware search).

## Summary

Feishu bot Q&A is brought inside the same conversation pipeline as Wiki AI: a Feishu-bound question creates the same kind of Wiki AI question/action record the web chat side pane already uses, and multi-turn continuity is linked through the Feishu Bot Session wrapper. Bot Session becomes a thin Feishu-specific wrapper around those canonical records so the existing session-window, rate-limit, and fan-out behavior still applies, but there is no second canonical history store. Captured turns flow through the existing Raw Conversation capture pipeline and are discoverable through the existing Raw search; admins manage one togglable Data Source ("AI Conversations") from Bots' General settings instead of a Content settings screen or a Feishu-specific switch, and the existing wiki-AI capture machinery (Conversation Raw page, built-in category, Conversation-specific reader, permission re-checks, audit trail) governs Feishu turns identically.

The principle is that **all bots share one AI core**: from the data model's perspective a conversation is a conversation regardless of whether it was started from the web chat side pane or from Feishu, and the only transport-specific state lives in the wrapper, not in a parallel history store.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bots General Owns One AI Conversations Data Source (Priority: P1)

As an Admin, I want a single Data Source toggle under Bots' General settings to govern whether AI conversations are captured into Raw, regardless of which channel (web Wiki AI, Feishu bot, future bots) the conversation came from, so bot and conversation retention policy is configured in the same place as bot behavior instead of being split across Content settings and per-bot pages.

**Why this priority**: Without a unified toggle in the Bots area, admins either over-capture or under-capture channels independently, and the product's "all bots share the same AI core" promise leaks through to retention policy. The toggle is the operator-facing contract for capture and belongs with shared bot configuration.

**Independent Test**: Sign in as Admin, open Bots → General, locate AI Conversations, toggle it off. Run a web Wiki AI chat and a Feishu Q&A from two different identities; neither produces a Raw Conversation page. Toggle it on, repeat both channels; both produce Raw Conversation pages under the same Conversation category. The old Content settings → Data Sources entry is not a second place to configure the same source; it is removed, redirected, or replaced with navigation to Bots → General. Toggle name changes from "Wiki AI Conversations" (or equivalent) to "AI Conversations" and existing default state is preserved across the rename.

**Acceptance Scenarios**:

1. **Given** an Admin opens Bots → General, **When** the Data Sources section is displayed, **Then** the section shows a single source labelled `AI Conversations` (not "Wiki AI Conversations" alone and not a separate Feishu-specific row) and the source has an enabled/disabled state.
2. **Given** AI Conversations is disabled, **When** a user runs a Wiki AI chat in the web UI, **Then** no Raw Conversation page is created.
3. **Given** AI Conversations is disabled, **When** a bound Feishu user asks the bot a question, **Then** the bot still answers the user, but no Raw Conversation page is created for that exchange.
4. **Given** AI Conversations is enabled, **When** a Feishu-bound user asks the bot a question, **Then** the exchange produces one Raw Conversation page assigned to the built-in `Conversation` category, indistinguishable from a wiki-AI-captured page except for its channel metadata.
5. **Given** the source's enabling state was set while 023 was already implemented, **When** the rename happens, **Then** the existing default state of the source is preserved for every existing deployment.
6. **Given** an admin changes the toggle, **When** future conversations are created, **Then** the new state applies without altering Raw Conversation pages that already exist.
7. **Given** an Admin opens the former Content settings → Data Sources location, **When** this feature is enabled, **Then** there is no duplicate editor for `AI Conversations`; the UI either routes the Admin to Bots → General or clearly points there as the canonical location.

---

### User Story 2 - Feishu Q&A Reuses the Wiki AI Record Pipeline (Priority: P1)

As a bound Feishu user, I want my message to the bot to be handled by the same Wiki AI chat pipeline that the web chat side pane uses, so that the conversation is consistent, resumable, and captured the same way as web conversations.

**Why this priority**: This is the heart of the unification. Without it, Feishu would still be a parallel track that happens to surface similar UI; with it, every benefit of the Wiki AI pipeline (session lifecycle, capture, history, search) automatically applies to Feishu.

**Independent Test**: As a bound Feishu user, ask a multi-turn question (with pause shorter than the session window). Verify the bot treats the exchange as one Feishu Bot Session while each turn is handled by the canonical Wiki AI question/action pipeline. Confirm each captured turn has one underlying Wiki AI action/session identifier, one Raw Conversation page, and a shared Feishu session metadata link; no surface reads from a Feishu-only timeline.

**Acceptance Scenarios**:

1. **Given** a bound Feishu user sends the bot a question in a 1:1 chat, **When** the bot answers, **Then** a Wiki AI question/action record is created for that turn and the question, answer, citations, thinking where retained, errors, and timestamps are stored against that record rather than in a Feishu-only history table.
2. **Given** a bound Feishu user @-mentions the bot in a group, **When** the bot answers, **Then** the answering record is owned by the @-mentioner's wiki account and linked to that user's Feishu Bot Session for that chat, never to a shared group session, and no other bound user in the same chat can read or resume it through the group.
3. **Given** a Feishu chat has an active Bot Session and the bound user sends another message within the configured session window, **When** the bot answers, **Then** the new turn creates a new canonical Wiki AI question/action record linked by the same Feishu session metadata, and conversation context is reconstructed from those canonical records.
4. **Given** a Feishu chat session window has elapsed or the bound user has explicitly asked for a new session, **When** the next message arrives, **Then** the bot starts a new Feishu Bot Session wrapper and links subsequent turns to that new wrapper while each turn remains a canonical Wiki AI record.
5. **Given** the bot defers a long-running answer to an asynchronous AI action, **When** the answer subsequently streams in, **Then** the streaming events are appended to the same canonical Wiki AI record for that inbound turn in order, and any partial capture status is reconciled only when the turn reaches a terminal state.
6. **Given** the Wiki AI record for a Feishu turn reaches a terminal state (completed, failed, cancelled, or expired), **When** the Feishu user receives the final reply, **Then** that terminal state drives the Raw Conversation page's lifecycle status and is visible wherever the captured turn is shown.

---

### User Story 3 - Bot Session Is a Thin Feishu-Specific Wrapper (Priority: P1)

As an operator maintaining the Feishu integration, I want the Feishu Bot Session to carry only the Feishu-only concerns (chat-window timing, rate limit, chat-id mapping, group fan-out) and delegate the actual conversation records to the Wiki AI pipeline, so I don't have to maintain two parallel history stores.

**Why this priority**: Duplication of state is what the unification is explicitly trying to remove. If the Bot Session entity still owns a parallel history record, the unification is only cosmetic.

**Independent Test**: Start a Feishu Q&A, observe the Bot Session row created for it, and confirm the row only holds Feishu-side state (chat id, binding, session window state, rate-limit counters); the conversation timeline itself lives in the canonical Wiki AI record for that turn. Then open the corresponding Raw Conversation page and verify only one history record is referenced.

**Acceptance Scenarios**:

1. **Given** a Feishu Q&A arrives, **When** a Bot Session is created, **Then** it persists only the Feishu-side lifecycle state and a reference to the latest canonical Wiki AI record; the Bot Session MUST NOT store a second timeline of question, answer, citations, or status changes for the conversation.
2. **Given** a Feishu user opens their AI chat history in any channel-aware surface (web chat side pane, AI Chat History list, Search → Raw page), **When** a captured turn is shown, **Then** every surface resolves to the same Wiki AI question/action identifier and the same Raw Conversation page for that turn, never to a separate Bot Session-only row.
3. **Given** the bound user resumes a Feishu conversation via the Feishu channel, **When** prior context is loaded, **Then** that context is read from canonical Wiki AI records linked by the Feishu session metadata, not from any Feishu-side cache.
4. **Given** a Feishu Q&A was answered before AI Conversations capture was enabled, **When** the toggle is later enabled, **Then** that exchange remains only in the Wiki AI record (no retroactive bot-only history appears) and any pre-existing Bot Session rows from before this feature remain as transport wrappers without gaining a parallel history record.
5. **Given** the bound user is unbound or deactivated mid-session, **When** the Bot Session is terminated, **Then** the underlying Wiki AI record is blocked from new turns, the Bot Session retains only a reference to its prior record id and current state, and no protected content leaks through either surface after termination.

---

### User Story 4 - Feishu Conversations Are Discovered by Raw Search (Priority: P1)

As a permitted search user, I want to find a Feishu answer I got yesterday by searching the wiki, so that useful Feishu exchanges become part of the same long-term memory as web conversations and other raw evidence.

**Why this priority**: The user's stated goal — "the conversation search should work after that" — is the principal benefit of unification and is the public test that the wiring is correct.

**Independent Test**: With AI Conversations enabled, ask a Feishu question that contains a unique phrase and a semantically related answer, wait until indexing settles, then search by exact phrase and by related wording. The corresponding Raw Conversation page appears in results and opens as a Feishu-captured Conversation page with the same reader as web-captured ones.

**Acceptance Scenarios**:

1. **Given** a captured Feishu conversation contains user question, assistant answer, citation text, source references, or error text, **When** a permitted user searches by matching words, **Then** the corresponding Raw Conversation page appears in results with an excerpt that explains the match.
2. **Given** a captured Feishu conversation contains meaning relevant to a search query but not the exact words, **When** meaning-based retrieval is available, **Then** the page can appear in results based on that semantic relevance.
3. **Given** a search result points to a captured Feishu conversation, **When** the user opens the result, **Then** the product opens the corresponding Raw Conversation page using the conversation-specific reader, not a Feishu-only or generic raw view.
4. **Given** the bound user or another user without Raw Conversation read permission searches for terms that match a captured Feishu conversation, **Then** no result, excerpt, count, or metadata reveals the conversation's existence through any channel.
5. **Given** a Feishu conversation has just reached a terminal state, **When** the user searches shortly after, **Then** the page either is absent with no false-positive placeholder or appears once indexing catches up; the result never reflects partial streaming text as if it were the final answer.

---

### User Story 5 - Conversation Raw Page Reader Works for Feishu Captures (Priority: P2)

As a user who opens a captured Feishu conversation from Search, AI Chat History, or a deep link, I want to see the same conversation-specific reader (questions, answers, thinking where retained, citations, errors, timestamps, status) that web captures use, so that one conversation looks the same regardless of which channel produced it.

**Why this priority**: Visual consistency is not blocking but it is the proof that Feishu and web conversations are, downstream of the capture pipeline, the same artifact.

**Independent Test**: Open a captured Feishu conversation from AI Chat History and from Search; the same retained content is shown with the same labels, same status, same reader. Compare against a web Wiki AI capture from the same account; only channel metadata differs.

**Acceptance Scenarios**:

1. **Given** a captured Feishu conversation includes an answer and citations, **When** the Raw page is opened, **Then** the answer and citations match what the Feishu user received in chat, displayed with the same layout and labels as a web capture.
2. **Given** a captured Feishu conversation includes thinking details, an insufficient-answer state, or an error, **When** the Raw page is displayed, **Then** those states are shown consistently with the existing AI Chat History session detail.
3. **Given** a captured Feishu conversation's status changes after the Raw page was first created, **When** the page is refreshed, **Then** the displayed status and available content reflect the latest preserved state without re-fetching from Feishu.
4. **Given** the product copy and labels appear on the page, **When** the UI is shown in supported locales, **Then** the labels are localized consistently with the existing AI chat history surfaces; the channel origin (feishu) is shown in metadata where captured but does not change the reader layout.
5. **Given** the same content was surfaced earlier via a Feishu-specific reply card, **When** the user later opens the same conversation from AI Chat History or Search, **Then** the answer text and citations read the same and reference the same source pages.

---

### User Story 6 - Admin Observes Feishu Capture With the Same Surfaces As Web Capture (Priority: P3)

As an Admin, I want the AI Conversations Data Source surface and audit log to show Feishu-captured conversations under the same view as web captures (with channel metadata available on demand), so that I have one place to monitor capture quality without channel-by-channel dashboards.

**Why this priority**: Useful for operations but not the user's primary motivation. Lower priority because once capture and search work the rest is incremental.

**Independent Test**: As Admin, audit-log a web capture and a Feishu capture around the same time, and confirm both entries exist with shared structure (Raw page id, created at, source binding) and a clearly recorded `channel=feishu` vs `channel=wiki-ai` discriminator.

**Acceptance Scenarios**:

1. **Given** AI Conversations is enabled, **When** a Feishu-bound user asks the bot a question, **Then** the audit log records the inbound Feishu attribution, the underlying Wiki AI record identifier, the bound wiki user, the action outcome, and a correlation identifier that excludes raw question, answer, and credential text.
2. **Given** a captured Feishu conversation yields a Raw page, **When** the Admin inspects the page's metadata, **Then** the page carries a channel field showing `feishu` and the source Feishu chat identifier (without leaking Feishu message ids or raw payloads) for traceability.
3. **Given** capture or indexing fails for one Feishu conversation, **When** an Admin checks capture health, **Then** the failure is observable through the existing capture-health surfaces (and never blocks unrelated Feishu or web conversations).

### Edge Cases

- A Feishu answer is still streaming when the configured session window expires: the Wiki AI record for that turn is finalized with whatever state has been preserved, the Bot Session is reset for the next inbound message, and the captured Raw page reflects the preserved state honestly without inventing a final answer that never arrived.
- The bound user unbinds (or is deactivated) while a Feishu conversation is in flight: the active Bot Session is terminated and the underlying Wiki AI record is blocked from new turn continuation; the captured Raw page, if already preserved, follows Raw retention policy and is no longer attributed to a now-unbound identity on subsequent access checks.
- A Feishu conversation references a page the bound user later loses read permission for: the Raw page remains preserved, but search and the reader re-check permission on each access and decline to reveal the underlying source page or its content where the user lacks it.
- A group chat contains multiple bound users and one of them @-mentions the bot: only the mentioner's binding drives the Wiki AI record for that turn; the captured Raw page is permission-scoped to that one bound user and never to the union of the group.
- The Data Source toggle is disabled after some conversations have been captured as Raw pages: existing Raw pages remain in place; only future exchanges stop producing new Raw pages. Disabling does not delete or tombstone captured history.
- The same captured Feishu turn is opened from Search, AI Chat History, and a deep link in the Feishu-reply card: every surface resolves to the same Raw Conversation page and the same underlying Wiki AI question/action identifier.
- A Feishu Q&A is started by a bound user but the AI provider is unavailable mid-answer: the Wiki AI record records a failure terminal state, the Raw page shows the preserved question and the safe failure message, and search picks it up once indexed.
- A duplicate Feishu event is replayed (anti-replay): the duplicate does not create a second Wiki AI record, does not produce a second Raw Conversation page, and does not deliver a second answer.
- A captured Feishu conversation contains content that should not be exposed to public readers: Raw search and Raw page access follow Raw permissions and never leak through public search.
- A Feishu Q&A is started by a user who later loses permission to read the underlying cited source pages: the captured Raw page is preserved but the answer text is shown as a permission-aware fallback (or states that no accessible material was found) per 019 FR-006 / spec 025 FR-024 at every subsequent read.

## Requirements *(mandatory)*

### Functional Requirements

**Data Source toggle unification**

- **FR-001**: The system MUST expose a single Admin-configurable Data Source named `AI Conversations` under Bots' General settings that governs the capture of every AI conversation channel (Wiki AI web chat and Feishu bot) into Raw Conversation pages.
- **FR-002**: The Data Sources section under Bots' General settings MUST NOT expose a separate per-channel toggle (e.g. a Feishu-specific row) for conversation capture; if additional channels are added later, they MUST be captured under the same `AI Conversations` source.
- **FR-003**: The system MUST rename the prior 023 "Wiki AI Conversations" source label to `AI Conversations` while preserving the existing stored enabled/disabled state of every deployment so the rename has no behavioral default-change.
- **FR-004**: While AI Conversations is disabled, the system MUST NOT capture any Feishu bot Q&A as a Raw Conversation page; the bot MUST still answer the user with the existing 019 behavior.
- **FR-005**: While AI Conversations is enabled, every captured Feishu Q&A turn MUST be recorded as exactly one Raw Conversation page assigned to the built-in `Conversation` category.
- **FR-006**: The former Content settings → Data Sources admin surface MUST NOT remain a second writable configuration entry for the same Data Sources; it MUST redirect, link, or otherwise route Admins to Bots' General settings as the canonical location.

**Pipeline reuse**

- **FR-007**: The Feishu bot MUST route every bound-user Q&A through the existing Wiki AI question/action pipeline (004-system-ai-support) so the question, assistant answer, thinking where retained, citations, source references, errors, timestamps, and lifecycle status of a Feishu exchange are stored against a canonical Wiki AI record.
- **FR-008**: The Wiki AI record created for a Feishu turn MUST be the canonical conversation record for that exchange; no parallel Feishu-only timeline table or appended history store may be introduced for newly captured conversations.
- **FR-009**: Resuming a Feishu conversation within the configured session window MUST link new turns through the same Bot Session wrapper while conversation content remains in canonical Wiki AI records.
- **FR-010**: The bound user who @-mentions the bot in a group chat MUST own the only Wiki AI record touched by that turn; other bound users in the same chat MUST NOT widen the scope, read the captured content, or trigger sibling records from that one turn.
- **FR-011**: A deferred long-running answer triggered from Feishu MUST stream into and finalize the same Wiki AI record that the inbound turn created; intermediate streaming MUST NOT appear as a fresh record.

**Bot Session thin wrapper**

- **FR-012**: The existing Feishu Bot Session entity (019 Key Entities / FR-007 / FR-008) MUST be retained only as a wrapper for Feishu-side concerns: the Feishu chat identifier, the active binding, session-window state, rate-limit counters, group-fan-out state, and the referenced latest Wiki AI record identifier.
- **FR-013**: The Bot Session MUST NOT store a second copy of the conversation timeline (question text, answer text, citations, source identifiers, errors, or status changes) parallel to the Wiki AI records.
- **FR-014**: On unbind, admin revocation, or user deactivation, the Bot Session MUST expire immediately, the underlying Wiki AI record MUST be blocked from new turns, and any retained Bot Session row MUST contain only the safe transport metadata listed in FR-012.

**Capture, indexing, and search**

- **FR-015**: A captured Feishu turn MUST be included in Raw keyword search for users permitted to read the corresponding Raw page, with no difference in excerpt length, ranking weight, or result presentation from a web capture.
- **FR-016**: A captured Feishu turn MUST be included in Raw meaning-based (semantic) search for users permitted to read the corresponding Raw page, under the same capability-id and permission scope as web captures.
- **FR-017**: A search result that points to a captured Feishu turn MUST identify it as a Conversation result and open the conversation-specific reader on click; it MUST NOT mark the result as a generic raw document or a Feishu-specific custom view.
- **FR-018**: The system MUST enforce Raw read permission on each search access to a captured Feishu turn, including on resume from Feishu, opening from search, opening from AI Chat History, and opening from a deep link.

**Presentation**

- **FR-019**: A Raw Conversation page produced from a Feishu capture MUST render with the existing conversation-specific reader (questions, answers, thinking where retained, citations, errors, timestamps, status) used for web captures; the channel of origin MUST be carried as page metadata and visible in admin surfaces where applicable but MUST NOT change the reader layout.
- **FR-020**: The product MUST provide localized labels for the Bots' General Data Sources section (renamed source), audit-channel metadata, and any new channel marker on the Raw Conversation page, consistent with the existing locales for 023 and 019.

**Security and audit**

- **FR-021**: Every Feishu-bot-initiated action that affects a Raw Conversation page MUST be attributed to the bound wiki user and recorded in the audit log with origin `feishu`, alongside the Wiki AI record identifier and a correlation identifier that contains no raw question, answer, or credential text.
- **FR-022**: Permission re-checks for reading or resuming a captured Feishu turn MUST run through the same `can()` chokepoint as every other Raw read, including when the reader is opened from a Feishu-side deep link.
- **FR-023**: A duplicate inbound Feishu event (replay) MUST NOT create a second Wiki AI record, a second Raw Conversation page, or a second delivered answer.
- **FR-024**: A Feishu user who lacks read permission for Raw Conversation content MUST NOT discover the existence of a captured Feishu turn through Search, public navigation, result counts, previews, or direct page open attempts, regardless of their prior participation in the chat.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- This feature does **not** change anonymously readable published page content, public metadata, or public navigation. No static/ISR cache impact on the public site.
- The capture pipeline writes only to Raw content, which is permission-gated and never part of the publicly readable, ISR-served reader body. The rename and relocation of a Data Source label is an Admin UI change and does not affect public documents.
- The Feishu Q&A surface continues to surface only content the bound wiki user can already read in the web UI; no new anonymous Wiki content/API surface is introduced.

### Key Entities *(include if feature involves data)*

- **AI Conversations Data Source**: The renamed, single Data Source configured from Bots' General settings that governs AI conversation capture across every channel (web Wiki AI and Feishu bot). Holds an enabled/disabled state and an admin-facing label `AI Conversations`. Replaces the prior 023 "Wiki AI Conversations" source conceptually without resetting its stored state.
- **Wiki AI Record**: The existing canonical Wiki AI question/action record (from 004-system-ai-support), now also the canonical record for each Feishu turn. Holds the conversation turn timeline, lifecycle status, timestamps, retained thinking, citations, source references, and errors. Channel of origin is recorded as page metadata on the resulting Raw page rather than as a divergent timeline.
- **Feishu Bot Session**: A thin Feishu-specific wrapper around canonical Wiki AI records. Holds the Feishu chat identifier, the active binding, session-window state, rate-limit counters, group-fan-out state, and the referenced latest Wiki AI record identifier. Holds no second copy of the conversation timeline.
- **Raw Conversation Page**: The existing canonical 023 artifact (Raw page in the built-in `Conversation` category). For a Feishu capture it additionally carries channel metadata (e.g. `channel: feishu`, the source Feishu chat identifier) sufficient to trace provenance without leaking Feishu message ids or raw payloads.
- **Channel Marker**: A read-only metadata field on a Raw Conversation page that records the capture channel (`wiki-ai` or `feishu`) for admin and operational visibility. Not user-editable; does not affect the reader layout.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, 100% of Feishu Q&A turns from a bound user, while AI Conversations is enabled, produce exactly one Raw Conversation page assigned to the built-in `Conversation` category and referencing the same underlying Wiki AI record identifier as the Q&A itself.
- **SC-002**: In acceptance testing, 100% of Feishu Q&A exchanges, while AI Conversations is disabled, produce no Raw Conversation page; the bot still answers the user.
- **SC-003**: At least 95% of captured Feishu conversations become discoverable by permitted users through keyword search within 2 minutes after the conversation reaches a terminal state under normal indexing conditions.
- **SC-004**: At least 90% of semantically relevant test queries about captured Feishu conversations return the expected Raw Conversation page in the first five permitted search results when meaning-based retrieval is available.
- **SC-005**: 100% of restricted-access tests return no Raw Conversation result, excerpt, count, or channel metadata to users who cannot read the underlying Raw page, regardless of whether the user originally participated in the Feishu chat.
- **SC-006**: In UI verification, opening the same captured Feishu conversation from Search, AI Chat History, and a Feishu deep link shows the same retained question, answer, citations, status, errors, and channel marker, indistinguishable from a web capture except for the channel marker.
- **SC-007**: 100% of data-lineage tests confirm there is exactly one canonical durable conversation record for a captured Feishu Q&A turn — the Wiki AI record — and that no parallel Feishu-only timeline table exists.
- **SC-008**: 100% of audit entries for Feishu-captured turns record origin `feishu`, the bound wiki user, the Wiki AI record identifier, and a correlation identifier free of raw question, answer, or credential text.
- **SC-009**: In configuration tests, an Admin can locate the `AI Conversations` Data Source under Bots' General settings and toggle it on or off in under 30 seconds without editing lower-level system configuration, the former Content settings → Data Sources location does not expose a duplicate writable control, and the rename from "Wiki AI Conversations" preserves the stored state of existing deployments.
- **SC-010**: In resume tests, a bound Feishu user who sends two turns within the configured session window sees both turns linked by the same Bot Session wrapper while each turn has its own canonical Wiki AI record; after the window has elapsed (or after explicit reset), a new turn opens a fresh Bot Session wrapper.

## Assumptions

- The wiki already exposes a Wiki AI record pipeline (004-system-ai-support), AI Capture → Raw Conversation machinery (023), Feishu binding and bot infrastructure (019), and Raw search with permission-scoped retrieval (013 / 017 / 022). This feature reuses and unifies them rather than introducing new capture or retrieval subsystems.
- The Feishu integration is the only bot channel covered in scope today; the architectural mandate is that future channels (additional chat platforms, voice, etc.) MUST plug into the same Wiki AI pipeline without introducing parallel history stores, even though their specific transports are out of scope here.
- The current Feishu Bot Session lifecycle requirements (019 Key Entities, FR-007–FR-010, FR-021, FR-028) continue to apply; this spec only restricts what the Bot Session is allowed to store about the conversation timeline.
- The existing 023 Data Source for `Wiki AI Conversations` is already deployed in some form; the rename to `AI Conversations` preserves the stored enabled state. If 023 has not yet shipped, this spec governs the label directly without a rename step.
- Raw retention, raw append-only rules, and audit retention windows are unchanged. This feature only adds a channel marker and a thin wrapper, not new lifecycle or retention behavior.
- Product copy is localized through the same pipeline as 023/019; per-channel labels follow the existing i18n surface and do not require new translation tooling.
- Pre-existing Feishu Bot Session rows that predate this feature continue to exist as transport wrappers; their prior conversation records are governed by existing 019 retention, not retroactively rewritten.
- The "AI Conversations" Data Source default is unchanged from 023's default (disabled for existing deployments). The rename does not flip any deployment's stored state.
- The Bots admin surface already exists as the canonical home for bot-provider configuration; this feature adds shared Data Sources to Bots' General settings and avoids maintaining a second Data Sources editor under Content settings.

## Out of Scope

- Adding new bot channels beyond Feishu (future channels plug into the same pipeline, but their transport, binding model, and notification surface are not defined here).
- Migrating pre-existing 023 Wiki AI captures or pre-existing Feishu bot answers into a different shape.
- Modifying Raw retention policy, append-only rules, or hard-delete behavior for Raw evidence.
- Adding a Feishu-specific search result presentation, a Feishu-only dashboard, or per-channel capture-health dashboards beyond what the existing capture-health surfaces already provide.
- Changing the Wiki AI answer-generation behavior, retrieval ranking, or permission semantics; those continue to be governed by 004, 013, 017, 019, and 022.
- Modifying the Feishu notification fan-out surface (019 User Story 3) or the binding flow (019 User Story 1); only the Q&A capture path is in scope.
- Changing the Feishu rate-limit defaults or session-window defaults beyond reusing them where they already exist.
