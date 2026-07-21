# Feature Specification: Raw Conversation Search

**Feature Branch**: `023-raw-conversation-search`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "所有的Wiki AI聊天记录，都可以记录成Raw的内容，Cateogry是内建的\"Conversation\"。（这个行为可以通过后台配置开关，放在CONTENT分类下的“数据源”配置项中，数据源可能有很多，聊天记录是其中一个），并把Raw中的内容纳入向量化embedding的范围，以便在Search功能中可以搜索到Raw中的聊天记录，并能打开相应的Raw页面。Conversation类型的Raw页面，需要做一下定制化，以便呈现出来的效果和Wiki AI中的聊天记录是一样的（可以抽出公共的组件）注意的是，目前已经有AI Chat History一个独立的表了，Session Detail的展示效果和我想在Raw Conversation里展示的效果就差不多，可以重用，不要单独搞，History可以考虑合并到Raw Pages（可以考虑使用frontmatter或是页面自身的状态来表示Conversation的Status），避免建立重复表。历史数据不需要迁移。"

**Depends on**: 004-system-ai-support (Wiki AI actions and chat sessions), 013-hybrid-page-search (search experience and search result navigation), 022-llm-wiki-mode (raw space, raw categories, raw reader, and raw search permissions).

## Summary

Wiki AI conversations can be captured as Raw content so that the conversations become part of the same evidence store as other raw source material. Administrators control this through the Content settings under a Data Sources section. The section may contain multiple source types over time; this feature adds Wiki AI Conversations as one source that can be enabled or disabled.

When enabled, each new Wiki AI chat session is recorded as a Raw page categorized with the built-in `Conversation` category. The Raw page is the canonical preserved record for the captured conversation and carries the conversation lifecycle state needed to show whether the session is running, completed, failed, cancelled, or expired.

Captured Raw Conversation pages are included in the searchable Raw content corpus, including meaning-based retrieval, so permitted users can find relevant chat history from Search and open the corresponding Raw page. Raw Conversation pages use a conversation-specific presentation that matches the existing AI Chat History session detail experience, so users see the same question, answer, thinking, citation, error, and status information instead of a generic raw text document.

The existing AI Chat History data is not migrated. For newly captured conversations, the product must converge on Raw pages as the authoritative history record instead of adding another parallel history store.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure AI Conversations as a Raw Data Source (Priority: P1)

As an Admin, I want Wiki AI conversation capture to appear as a configurable data source under Content settings, so that I can decide whether chat sessions should be preserved as Raw evidence before the product starts recording them.

**Why this priority**: Capturing AI chats can preserve useful source material, but it also changes retention and discoverability. Operators need explicit control before new conversations become Raw pages.

**Independent Test**: Open Content settings as an Admin, find the Data Sources section, toggle Wiki AI Conversations on and off, then start new Wiki AI chats in each state and verify that only the enabled state creates Raw Conversation pages.

**Acceptance Scenarios**:

1. **Given** an Admin opens Content settings, **When** the Data Sources section is displayed, **Then** Wiki AI Conversations appears as a distinct source alongside any other configured sources.
2. **Given** Wiki AI Conversations is disabled, **When** a user completes a new Wiki AI chat, **Then** no Raw Conversation page is created for that chat.
3. **Given** Wiki AI Conversations is enabled, **When** a user starts a new Wiki AI chat, **Then** the conversation is captured as Raw content and remains associated with the original chat session.
4. **Given** an Admin changes the setting, **When** future conversations are created, **Then** the new setting applies without changing already captured Raw Conversation pages.

---

### User Story 2 - Preserve New AI Chats as Conversation Raw Pages (Priority: P1)

As a permitted user reviewing source material, I want each captured Wiki AI chat to be represented as a Raw page in the built-in Conversation category, so that AI conversations are preserved consistently with other raw evidence and can be traced later.

**Why this priority**: The search and custom reading experience only have value if each captured conversation is represented once, consistently categorized, and complete enough to reconstruct the session.

**Independent Test**: Enable the source, run Wiki AI chats that complete, fail, and are cancelled, then inspect their Raw pages and verify each page has the Conversation category, an accurate status, and all available conversation events.

**Acceptance Scenarios**:

1. **Given** Wiki AI Conversations is enabled, **When** a new chat session records a user question, assistant answer, thinking details, citations, tool/source events, or errors, **Then** the corresponding Raw Conversation page preserves those events in chronological order.
2. **Given** a captured conversation is still running, **When** its Raw page is opened, **Then** the page shows the current running state and any events recorded so far.
3. **Given** a captured conversation reaches completed, failed, cancelled, or expired state, **When** the Raw page is opened later, **Then** the page shows the final state and the preserved conversation content.
4. **Given** a Raw Conversation page exists, **When** its category is inspected, **Then** it is assigned to the built-in `Conversation` category and is not filed under a user-created category by default.
5. **Given** a captured conversation is represented as a Raw page, **When** the history list or detail view needs to show that new conversation, **Then** it resolves to the same canonical Raw conversation record instead of a duplicated history record.

---

### User Story 3 - Find Raw Conversations from Search (Priority: P1)

As a permitted search user, I want Search to find captured Raw Conversation pages by their conversation content, so that useful answers and past questions are discoverable alongside other wiki knowledge.

**Why this priority**: The main product value is making preserved conversations retrievable. Recording Raw pages without search inclusion would make the content difficult to reuse.

**Independent Test**: Enable the source, run a chat containing a unique phrase and a semantically related answer, wait until searchable content is available, then search by exact phrase and related wording and verify the Raw Conversation page appears only for users allowed to read it.

**Acceptance Scenarios**:

1. **Given** a Raw Conversation page contains a user question, assistant answer, citation text, or error text, **When** a permitted user searches for matching words, **Then** the page appears in results with an excerpt that explains the match.
2. **Given** a Raw Conversation page contains meaning relevant to a search query but not the exact words, **When** meaning-based retrieval is available, **Then** the page can appear in results based on that semantic relevance.
3. **Given** a search result points to a Raw Conversation page, **When** the user opens the result, **Then** the product opens the corresponding Raw page instead of the legacy AI Chat History detail dialog.
4. **Given** a user cannot read Raw Conversation content, **When** they search for terms that match a captured conversation, **Then** no result, excerpt, count, or metadata reveals the conversation's existence.
5. **Given** a captured conversation has not yet become searchable, **When** a permitted user searches for it, **Then** the system avoids stale or misleading results and makes the conversation discoverable once indexing completes.

---

### User Story 4 - Read Raw Conversations with the Chat Detail Experience (Priority: P2)

As a user who opens a Raw Conversation page, I want it to look and behave like the existing AI chat session detail, so that I can read the conversation naturally instead of parsing raw event data.

**Why this priority**: Raw Conversation pages are pages, but their content is conversational. Reusing the familiar session detail shape keeps review efficient and avoids two different displays for the same concept.

**Independent Test**: Open the same newly captured conversation from AI Chat History and from Search as a Raw page, and verify that both surfaces present the same user question, answer, thinking, citations, errors, timestamps, and status using a consistent layout.

**Acceptance Scenarios**:

1. **Given** a Raw page has Conversation type, **When** it is opened, **Then** it uses the conversation-specific reader instead of the generic raw document renderer.
2. **Given** a conversation includes answer text and citations, **When** the Raw page is displayed, **Then** the answer and citations match the existing AI session detail presentation.
3. **Given** a conversation includes thinking details, an insufficient-answer state, or an error, **When** the Raw page is displayed, **Then** those states are shown consistently with AI Chat History session detail.
4. **Given** the conversation status changes after the Raw page was first created, **When** the page is refreshed, **Then** the displayed status and available content reflect the latest preserved state.
5. **Given** product copy and labels appear on Raw Conversation pages, **When** the UI is shown in supported locales, **Then** the labels are localized consistently with existing AI chat history surfaces.

---

### User Story 5 - Avoid Duplicate Chat History Storage (Priority: P2)

As an operator maintaining the product, I want newly captured AI chat history to converge on Raw pages instead of a second independent history store, so that retention, search, permissions, and display rules are consistent.

**Why this priority**: Duplicate durable records create drift, unclear deletion behavior, inconsistent statuses, and extra migration work. The feature should establish Raw pages as the future path without requiring legacy migration.

**Independent Test**: Enable Wiki AI Conversations, create a new chat, then verify the user-facing history list, session detail, Raw page, and Search result all refer to the same captured conversation identity and status.

**Acceptance Scenarios**:

1. **Given** a new conversation is captured as Raw, **When** it appears in the user's AI chat history list, **Then** the list item uses the same conversation identity and status as the Raw Conversation page.
2. **Given** a user opens detail for a newly captured conversation from AI Chat History, **When** the detail is displayed, **Then** the content matches the Raw Conversation page without relying on a separate divergent copy.
3. **Given** a user resumes a conversation from history, **When** the product loads the prior context, **Then** it uses the canonical captured conversation content available for that session.
4. **Given** pre-existing AI Chat History records were created before this feature, **When** the feature is enabled, **Then** those legacy records are not migrated into Raw pages automatically.

### Edge Cases

- The Conversation category does not exist when the feature is first enabled: the product creates or restores the built-in category before recording conversations.
- An Admin retires or hides user-managed raw categories: the built-in Conversation category remains available for Wiki AI conversation capture.
- The same chat receives multiple streaming updates: the Raw Conversation page shows one coherent session timeline, not duplicate answer fragments or out-of-order events.
- A chat fails before an answer is generated: the Raw Conversation page still records the question, failure status, and any safe diagnostic message available to the user.
- A chat expires according to existing AI retention rules: the Raw Conversation page shows the expired state and any content still retained under the configured policy.
- Search indexing is delayed or temporarily unavailable: chat capture still succeeds, and the page becomes searchable after indexing recovers.
- A permitted user opens a search result after their access changes: the page open is rechecked and denied if they no longer have permission.
- A legacy AI Chat History record has no Raw page: the existing history experience may continue to show it, but Search is not required to expose it as Raw content.
- A user requests deletion or removal of a newly captured history entry: the product must not hard-delete append-only Raw evidence; any user-facing removal behavior must be clearly distinguished from Raw record retention.
- A conversation contains content that should not be exposed to public readers: Raw search and Raw page access follow Raw permissions and must not leak through public search.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a Content settings section named Data Sources where Admin users can view and configure content sources that feed Raw content.
- **FR-002**: The Data Sources section MUST include Wiki AI Conversations as a configurable source with an enabled/disabled state.
- **FR-003**: The system MUST NOT capture new Wiki AI conversations as Raw pages while the Wiki AI Conversations source is disabled.
- **FR-004**: When the Wiki AI Conversations source is enabled, the system MUST capture each new Wiki AI chat session as exactly one Raw Conversation page.
- **FR-005**: The system MUST provide a built-in Raw category named `Conversation` and MUST assign every Raw Conversation page to that category.
- **FR-006**: The built-in `Conversation` category MUST remain available for system use and MUST NOT be removable in a way that breaks future Wiki AI conversation capture.
- **FR-007**: A Raw Conversation page MUST preserve the conversation timeline, including user questions, assistant answers, thinking details when retained, citations, source references, errors, timestamps, and status changes that are available under the product's retention policy.
- **FR-008**: A Raw Conversation page MUST expose a lifecycle status sufficient to distinguish at least running, completed, failed, cancelled, and expired conversations.
- **FR-009**: Conversation capture MUST be incremental enough that a running chat can be opened as a Raw page before final completion, while still avoiding duplicated or out-of-order displayed events.
- **FR-010**: For newly captured conversations, the Raw Conversation page MUST be the canonical durable history record used by history list, detail, resume, and search surfaces wherever those surfaces show the captured conversation.
- **FR-011**: The system MUST NOT create or require a second independent durable chat-history record for newly captured conversations when a Raw Conversation page already represents the session.
- **FR-012**: Existing AI Chat History records created before this feature MUST NOT be migrated automatically into Raw pages.
- **FR-013**: Legacy AI Chat History records without Raw pages MAY continue to be listed and opened through the existing history experience until their normal retention behavior applies.
- **FR-014**: Raw Conversation content MUST be included in keyword search for users permitted to read the corresponding Raw page.
- **FR-015**: Raw Conversation content MUST be included in meaning-based search for users permitted to read the corresponding Raw page.
- **FR-016**: Search results for Raw Conversation pages MUST identify that the result is a conversation and MUST provide a relevant excerpt from the conversation content when allowed.
- **FR-017**: Opening a Raw Conversation search result MUST navigate to the corresponding Raw page and render the conversation-specific page experience.
- **FR-018**: Search MUST enforce Raw read permissions before returning Raw Conversation results, excerpts, counts, or metadata.
- **FR-019**: A user who cannot read a Raw Conversation page MUST NOT discover its existence through Search, public navigation, result counts, previews, or direct page open attempts.
- **FR-020**: Raw pages with Conversation type MUST render with a conversation-specific display that matches the existing AI Chat History session detail experience for questions, answers, thinking, citations, insufficient-answer state, errors, timestamps, and status.
- **FR-021**: The AI Chat History detail surface and the Raw Conversation page surface MUST share the same conversation presentation rules so that the same captured conversation is not displayed differently across product areas.
- **FR-022**: The product MUST provide localized labels, statuses, empty states, and errors for Data Sources configuration, Raw Conversation search results, and Raw Conversation page display.
- **FR-023**: If capture, search indexing, or conversation rendering fails for one conversation, the failure MUST be observable to permitted operators without blocking unrelated Wiki AI chats.

### Key Entities

- **Data Source Setting**: An Admin-managed Content setting for a Raw input source. This feature adds Wiki AI Conversations as one source with an enabled/disabled state.
- **Conversation Category**: A built-in Raw category named `Conversation`, reserved for Wiki AI chat records and kept available for future captures.
- **Raw Conversation Page**: A Raw page representing one Wiki AI chat session, categorized as Conversation, carrying the session timeline, lifecycle status, timestamps, and readable conversation content.
- **Conversation Timeline Event**: A preserved event in a chat session, such as question, answer, thinking, citation, source reference, status update, cancellation, failure, or expiration.
- **Search Result**: A permitted result that points to a Raw Conversation page, labels it as conversation content, and opens the Raw page when selected.
- **Legacy AI Chat History Record**: A pre-feature history record that may remain available through existing history UI but is not automatically migrated into Raw pages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, 100% of new Wiki AI conversations created while the source is enabled produce exactly one Raw Conversation page assigned to the `Conversation` category.
- **SC-002**: In acceptance testing, 100% of new Wiki AI conversations created while the source is disabled produce no Raw Conversation page.
- **SC-003**: At least 95% of captured conversations become discoverable by permitted users through keyword search within 2 minutes after the conversation reaches a terminal state under normal indexing conditions.
- **SC-004**: At least 90% of semantically relevant test queries return the expected Raw Conversation page in the first five permitted search results when meaning-based retrieval is available.
- **SC-005**: 100% of restricted-access search tests return no Raw Conversation result, excerpt, count, or metadata to users who cannot read the underlying Raw page.
- **SC-006**: In UI verification, Raw Conversation pages and AI Chat History session detail display the same retained question, answer, citations, status, error, and insufficient-answer state for newly captured conversations.
- **SC-007**: 100% of pre-feature legacy AI Chat History records remain unmigrated after enabling the source.
- **SC-008**: In configuration tests, Admin users can enable or disable Wiki AI Conversations from Content Data Sources in under 30 seconds without editing lower-level system configuration.

## Assumptions

- This feature applies to deployments where Raw pages are available. If the instance is not in a mode that exposes Raw content, the Wiki AI Conversations source is unavailable or inactive until Raw content is available.
- Wiki AI Conversations is disabled by default for existing deployments to avoid changing chat retention and discoverability without Admin action.
- Raw Conversation visibility follows Raw content permissions. Search and direct page opens must recheck permissions even if the user originally participated in the chat.
- Conversation capture is for new sessions after the source is enabled. Historical migration is explicitly out of scope.
- Conversation display reuses the same product presentation rules as the existing AI chat session detail, but implementation choices are deferred to planning.
- User-facing removal of a history shortcut, if retained, does not imply hard deletion of append-only Raw evidence.
- Search indexing may be asynchronous; capture success and eventual search visibility are separate states.

## Out of Scope

- Migrating existing AI Chat History records into Raw pages.
- Adding new Raw data source types beyond Wiki AI Conversations.
- Changing Raw append-only retention rules or creating hard-delete behavior for Raw evidence.
- Building a new standalone search interface, analytics dashboard, or conversation management product.
- Changing the AI answer generation behavior itself.
