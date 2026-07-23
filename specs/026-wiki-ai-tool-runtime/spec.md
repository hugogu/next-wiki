# Feature Specification: Wiki AI Tool Runtime

**Feature Branch**: `026-wiki-ai-tool-runtime`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "目前Wiki AI聊天窗口只支持问答，而无法对Wiki本身进行操作。通过集成自身MCP的方式，可以以标准的方式对Wiki进行操作，管理页面、内容、标签等待。这部分需要在后台有MCP管理的功能，除了自己的MCP，还需要支持潜在的其它MCP来获取补充信息以便更好地回答或编写内容(本期先不做外部其它MCP，只是设计上需要考虑到可扩展性)。通过MCP进行的操作，添加一个参数表示是否需要Admin的Review才能生效（页面的变更有Diff，所以可以利用现有的草稿机制，history就可以diff；但是像Tag的变化，需要独立的页面来让用户Review AI做的Tag变更）。这部分可能会需要实现Tool Call的循环，以便让AI能渐进地，逐步地分析、操作Wiki。Tool Calling的过程需要显示在聊天对话框中。Tool Calling的结果因为内容差异比较大，暂不作为Conversation的记录内容。但是需要记录Tool Calling所运行的命令（都是markdown中的一部分），但如果 tool result 被 AI 用来生成 durable knowledge，须作为 Raw evidence被追踪（使用独立的Raw Category）。Tool calling may automate work, but durable knowledge changes must remain permission-scoped, audited, reviewable, and reversible."

**Depends on**: 004-system-ai-support (Wiki AI chat/action lifecycle, model configuration, permissions), 007-public-wiki-api (page and content management contract), 010-ai-curation-api (batch/content curation surface), 014-page-tags-metadata (page tags and metadata), 018-revision-diff (page diff review), 022-llm-wiki-mode (Raw evidence space and generated/wiki provenance), 023-raw-conversation-search (Conversation capture behavior), 025-feishu-bot-conversation-capture (shared AI conversation pipeline).

## Summary

Wiki AI evolves from a question-answering surface into a permission-scoped tool-using assistant that can inspect, organize, and propose changes to the wiki through a managed tool runtime. The first delivery exposes the instance's own wiki-management tools to Wiki AI, using MCP-compatible tool semantics so the same model can later be extended with other MCP providers without changing the user-facing workflow. The primary entry points are the web Wiki AI chat pane and configured bot channels such as Feishu; both must route through the same AI question/tool-chat core so their capabilities stay equivalent under the same permissions and review policy.

Administrators manage this runtime under AI settings in a Tools area. They can see the available wiki tools, enable or disable categories of tools, and define whether mutating operations require Admin review before taking effect. Tool calls run as part of the normal Wiki AI conversation lifecycle, can happen in multiple steps, and are visible in the chat window so users understand what the assistant is doing.

Durable changes remain governed. Page-content changes that require review are represented as drafts and reviewed through existing page diff history. Non-page-content changes, such as tag or metadata updates, are represented as reviewable change proposals with before/after details. Tool results are not stored wholesale inside Conversation records because their shape and size vary widely, but the markdown command record for each tool call is retained. If a tool result is used to create or update durable knowledge, that result must be traceable as Raw evidence under a dedicated Raw category.

External MCP providers are intentionally out of scope for this delivery, but the management and policy model must not assume there will only ever be the built-in wiki provider.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure Wiki AI Tools (Priority: P1)

As an Admin, I want to manage the tools available to Wiki AI under AI settings, so that I can decide which wiki operations the assistant may perform and which operations require review before they affect durable content.

**Why this priority**: Tool use changes Wiki AI from read-only Q&A into an operational assistant. Administrators need a clear control surface before any user can trigger tool calls.

**Independent Test**: Open AI settings as Admin, navigate to Tools, verify the built-in wiki tool provider is listed, enable read tools, keep mutating tools review-required, and confirm a non-admin cannot change tool configuration.

**Acceptance Scenarios**:

1. **Given** an Admin opens AI settings, **When** they choose Tools, **Then** the system lists the built-in wiki tool provider and its available tool categories.
2. **Given** a tool is listed, **When** the Admin views its details, **Then** they can see its purpose, whether it reads or mutates content, its required permission scope, its default review behavior, and whether it is currently enabled.
3. **Given** an Admin disables a tool category, **When** a user asks Wiki AI to perform a task requiring that category, **Then** the assistant does not call the disabled tool and explains that the operation is unavailable.
4. **Given** a non-admin opens or directly requests the tool-management surface, **When** access is evaluated, **Then** the request is denied without exposing hidden tool configuration.
5. **Given** this feature is active, **When** administrators inspect the Tools area, **Then** external tool-provider support is visibly reserved for a later phase and no external provider can be activated in this phase.

---

### User Story 2 - Let Wiki AI Use Tools During Chat (Priority: P1)

As an authorized Wiki AI user, I want the chat assistant to search, inspect, and prepare wiki changes through tools, so that I can organize the knowledge base conversationally instead of manually navigating every page.

**Why this priority**: This is the core value of the feature: the chat window becomes an operational interface for the wiki, not only an answer box.

**Independent Test**: Enable read tools and one review-required write tool. Ask Wiki AI to find pages about a topic, inspect the relevant pages, and propose a page update. Confirm tool calls happen in multiple visible steps and the proposed update does not bypass review.

**Acceptance Scenarios**:

1. **Given** Wiki AI tools are enabled for a user, **When** the user asks a question that requires wiki inspection, **Then** the assistant may call permitted read tools, use their results in the response, and cite the inspected content.
2. **Given** the user asks Wiki AI to change wiki content, **When** the required mutating tool is enabled and permitted, **Then** the assistant may prepare the change subject to the effective review policy.
3. **Given** the user lacks permission for a page, tag, metadata field, or operation, **When** Wiki AI considers a tool call involving that resource, **Then** the tool call is denied or filtered under the user's permission context and no protected content is exposed.
4. **Given** a task requires several steps, **When** Wiki AI needs more information before proposing a change, **Then** it can call tools iteratively until it completes, fails, reaches the configured limit, or the user cancels the request.
5. **Given** a tool call fails, times out, or returns insufficient information, **When** the assistant continues the conversation, **Then** it reports the recoverable failure and does not present unsupported conclusions as durable knowledge.
6. **Given** a user asks Wiki AI to save, write, or turn the previous answer or prior conversation content into a standalone wiki page, **When** page-draft tools are enabled and permitted, **Then** the assistant uses the tool runtime to create a draft page or proposed revision instead of merely answering conversationally.
7. **Given** a bound Feishu user asks the bot for the same wiki operation, **When** the corresponding tools are enabled and the selected model supports tool calling, **Then** the Feishu-originated turn uses the same tool-chat core, permissions, review policy, and conversation context as the web Wiki AI pane.

---

### User Story 3 - Review AI-Proposed Changes Before They Take Effect (Priority: P1)

As an Admin reviewer, I want mutating tool calls to produce reviewable changes when policy requires review, so that AI can automate preparation while durable wiki changes remain controlled, audited, and reversible.

**Why this priority**: Without review, the feature would create an unsafe path for AI to modify durable knowledge. Review is the boundary that makes operational AI acceptable.

**Independent Test**: Ask Wiki AI to update a page and retag several pages with review required. Confirm the page update appears as a draft with a diff, the tag updates appear as change proposals with before/after details, and neither change affects the published/wiki state until an Admin approves it.

**Acceptance Scenarios**:

1. **Given** a page-content tool call requires review, **When** Wiki AI prepares the change, **Then** the system creates a reviewable draft or proposed revision and shows the page diff before approval.
2. **Given** a non-page-content tool call requires review, such as a tag or metadata change, **When** Wiki AI prepares the change, **Then** the system creates a change proposal showing each affected resource, the before state, the after state, and the reason supplied by the assistant.
3. **Given** an Admin approves a proposal, **When** the proposal is applied, **Then** the resulting durable change is attributed, audited, versioned where applicable, and visible through normal history or proposal records.
4. **Given** an Admin rejects a proposal, **When** rejection is recorded, **Then** no durable content or metadata changes are applied and the rejection remains visible for audit.
5. **Given** an operation is allowed to apply without review, **When** Wiki AI performs it, **Then** the operation still runs under the user's permission context, creates normal audit/history records, and remains reversible according to the affected resource type.

---

### User Story 4 - Show Tool Calling in the Chat Window (Priority: P2)

As a Wiki AI user, I want to see tool calls as they happen in the chat, so that I understand what the assistant searched, inspected, or prepared before it gives an answer or change proposal.

**Why this priority**: Tool visibility builds trust and helps users diagnose why the assistant answered or proposed a change, but it depends on the core tool runtime.

**Independent Test**: Start a chat request that triggers several tool calls. Confirm the chat shows tool-call start, command markdown, status, completion/failure, and review outcome without rendering large raw results into the conversation transcript.

**Acceptance Scenarios**:

1. **Given** a tool call starts, **When** the chat window updates, **Then** the user sees the tool name, the markdown command record, and a running status.
2. **Given** a tool call completes, **When** the chat window updates, **Then** the user sees completion status and a concise result summary or review link, not the full raw tool result.
3. **Given** a tool call fails or is blocked by policy, **When** the chat window updates, **Then** the user sees a safe failure status that explains what happened without leaking hidden content or secrets.
4. **Given** a chat is later opened from history or Raw Conversation view, **When** the user reviews the transcript, **Then** the retained conversation includes the markdown command records and safe status metadata, but not full arbitrary tool-result payloads.

---

### User Story 5 - Preserve Tool Evidence for Durable Knowledge (Priority: P2)

As an Admin maintaining a self-growing knowledge base, I want tool results that influenced durable knowledge to be traceable as Raw evidence, so that generated or updated wiki content remains grounded even when the tool output itself is not stored in the conversation transcript.

**Why this priority**: The project's self-growth model requires durable knowledge to remain evidence-backed. Tool calls can introduce important source material that must not disappear from the audit trail.

**Independent Test**: Use Wiki AI to call a tool whose result is used to create or update durable content. Confirm a Raw evidence entry is created in the dedicated category, the durable change references that evidence, and users without Raw permission cannot discover the evidence through search or page access.

**Acceptance Scenarios**:

1. **Given** a tool result is used as source material for a durable page, generated concept, tag proposal, or metadata proposal, **When** the durable change is created or proposed, **Then** the tool result is preserved or referenced as Raw evidence under a dedicated Tool Evidence category.
2. **Given** a tool result is used only for transient chat reasoning and does not affect durable knowledge, **When** the conversation is retained, **Then** the full result is not required to be stored as Raw evidence.
3. **Given** Raw evidence is created from a tool result, **When** an authorized user inspects the durable change later, **Then** they can identify the supporting Raw evidence and the tool-call command that produced it.
4. **Given** a user lacks permission to read the Raw evidence, **When** they open the conversation, proposal, search results, or durable page, **Then** the evidence content and existence are not disclosed beyond allowed citations.

---

### User Story 6 - Keep the Tool Runtime Extensible (Priority: P3)

As a future integrator, I want the tool-management model to distinguish the built-in wiki provider from future external providers, so that later MCP integrations can be added without changing review, audit, and permission semantics.

**Why this priority**: External MCP providers are explicitly out of scope for this delivery, but the first version must not make product or policy decisions that block them.

**Independent Test**: Inspect the Tools area and exported tool metadata. Confirm every tool is associated with a provider, risk level, permission requirement, result-retention policy, and review policy, while only the built-in wiki provider can be enabled in this phase.

**Acceptance Scenarios**:

1. **Given** tools are listed, **When** an Admin inspects them, **Then** each tool identifies its provider, capability category, read/write risk, result-retention policy, and review behavior.
2. **Given** a future external provider type exists conceptually, **When** this phase is deployed, **Then** the system does not expose a usable external-provider registration flow.
3. **Given** an external-provider capability is added in a later phase, **When** it adopts the same tool metadata and review concepts, **Then** existing review, audit, and Raw evidence requirements remain applicable.

### Edge Cases

- A user asks Wiki AI to perform a mutation while all mutating tools are disabled: the assistant explains the unavailable capability and does not attempt a hidden fallback.
- A tool call requests Admin review even though policy allows immediate application: the system records the request and uses the stricter effective policy.
- A tool call requests no review but policy requires review: the system creates a proposal and never applies the change immediately.
- A tool loop reaches the maximum number of steps: the assistant stops, summarizes completed steps, and avoids presenting unfinished work as complete.
- A user cancels a running tool workflow: pending tool calls stop where possible, no unapplied proposal is auto-approved, and completed changes remain auditable.
- A proposal is reviewed after the underlying page, tag, or metadata changed: the reviewer sees the conflict and must refresh, revise, or reject the proposal before it can apply.
- A proposed page edit targets a page that is unpublished, deleted, moved, or no longer readable by the original actor: applying the proposal is blocked or revalidated without leaking protected information.
- A tool result is very large, binary, malformed, or sensitive: the conversation stores only the command record and safe status metadata; if the result is needed as evidence, the Raw evidence entry follows the Raw storage and permission rules.
- A Raw evidence category for tool output is missing, retired, or unavailable: durable AI-generated changes that depend on uncaptured tool output are blocked until evidence capture is available.
- A public wiki page is changed through an approved tool proposal: public readers see the change only after the normal publish/apply action completes and public delivery invalidation has run.
- An AI provider cannot perform tool calling for the selected model: the chat explains that tool use is unavailable for that model and falls back to ordinary Q&A when possible.
- A tool call returns content from pages the user cannot read: those results are filtered or denied before the assistant can use them.

## Requirements *(mandatory)*

### Functional Requirements

**Tool management**

- **FR-001**: The system MUST provide an Admin-only Tools area under AI settings for managing tools available to Wiki AI.
- **FR-002**: The Tools area MUST list the built-in wiki tool provider and the available tool categories for reading, organizing, and mutating wiki content.
- **FR-003**: Each listed tool MUST expose its user-facing purpose, provider, capability category, read/write risk, required permission scope, result-retention policy, enabled state, and effective review policy.
- **FR-004**: Admins MUST be able to enable or disable tool categories and set review policy for mutating tools without changing model-provider configuration.
- **FR-005**: Mutating tools MUST default to review-required unless an Admin explicitly configures a safer immediate-apply policy for a specific tool category and actor scope.
- **FR-006**: This phase MUST NOT allow administrators or users to activate arbitrary external MCP providers, but the tool-management model MUST distinguish provider identity so future providers can reuse the same policy surface.

**Tool calling in Wiki AI**

- **FR-007**: Wiki AI MUST be able to call enabled, permitted tools during a chat turn to inspect wiki content, prepare changes, or support an answer.
- **FR-008**: Tool calls MUST run under the initiating user's permission context; Admin review, background execution, or MCP compatibility MUST NOT expand that user's read or write permissions.
- **FR-009**: Wiki AI MUST support iterative tool use within a bounded loop so it can call a tool, inspect the result, decide whether another tool call is needed, and continue until completion, failure, cancellation, or limit reached.
- **FR-010**: Every tool call that can mutate durable state MUST include a requested review value from the assistant or caller, and the system MUST compute and record an effective review decision. Non-Admin actors MUST receive the strictest result implied by policy and request; an initiating Admin MUST bypass Admin review because self-review adds no authorization boundary.
- **FR-011**: If a selected model or AI provider cannot use tools, the chat MUST show tool use as unavailable and MUST NOT silently execute operations outside the model's visible reasoning flow.
- **FR-012**: Tool workflows MUST be cancellable by the user while they are running; cancellation MUST NOT approve pending proposals or roll back already-completed, audited operations unless a normal revert operation is explicitly requested.
- **FR-034**: Web Wiki AI and configured bot channels MUST pass bounded recent conversation context into tool-enabled chat so follow-up instructions such as "write the above into a page" can operate on the prior answer.
- **FR-035**: Feishu bot AI turns MUST use the same Wiki AI tool-chat service as the web chat pane when tools are available, and MUST fall back to ordinary Q&A only when the selected model or policy makes tool use unavailable.
- **FR-036**: Admins MUST be able to configure the minimum semantic relevance score for Wiki AI and bot answer retrieval under Bots > General, and candidates below that threshold MUST be discarded before entering model context.
- **FR-037**: Search and page-list tool results MUST remain discovery candidates and MUST NOT be presented as final Sources unless the assistant actually reads the page; final Sources MUST contain only cited baseline retrieval sources and content-bearing page reads.

**Review and application of changes**

- **FR-013**: Page-content changes that require review MUST be stored as reviewable drafts or proposed revisions and MUST expose a source diff before approval.
- **FR-014**: Non-page-content changes that require review, including tag and metadata changes, MUST be stored as change proposals with affected resources, before state, after state, assistant-provided rationale, requested review value, effective review decision, and current proposal status.
- **FR-015**: Change proposals MUST support at least pending, approved, rejected, applied, failed, and superseded states.
- **FR-016**: Applying an approved proposal MUST re-check the reviewer's permission and the original operation's current validity before changing durable state.
- **FR-017**: Rejected proposals MUST NOT mutate durable wiki state and MUST remain available for audit.
- **FR-018**: Immediately applied tool mutations MUST still create normal history, audit, and revert paths equivalent to the same mutation performed manually.
- **FR-019**: Tool calls MUST NOT hard-delete pages, Raw evidence, revisions, tags, or metadata unless a separate feature explicitly permits hard deletion; deletion-like actions MUST use the existing reversible behavior.

**Chat display and conversation retention**

- **FR-020**: The chat window MUST display tool-call progress, including the tool name, markdown command record, running/completed/failed/blocked status, and any linked proposal or draft created by the call.
- **FR-021**: The retained Conversation record MUST include each tool call's markdown command record and safe status metadata.
- **FR-022**: The retained Conversation record MUST NOT store full arbitrary tool-result payloads by default.
- **FR-023**: Tool-call displays MUST redact secrets, hidden configuration values, and content the viewer is no longer permitted to read.
- **FR-024**: Opening a retained conversation MUST re-check permissions before showing any tool-call command detail, linked proposal, draft, page reference, or evidence reference.

**Raw evidence and durable knowledge**

- **FR-025**: The system MUST provide or restore a dedicated Raw category for tool-derived evidence.
- **FR-026**: If a tool result is used to create, update, or justify durable knowledge, the result or a sufficient source artifact MUST be preserved as Raw evidence or linked to an existing Raw/page revision that already contains the same source material.
- **FR-027**: Durable AI-generated or AI-updated content MUST carry a traceable relationship to the tool-call command record and the Raw evidence or source revision that supports the change.
- **FR-028**: If required Raw evidence capture is unavailable, the system MUST block durable AI-generated changes that depend on uncaptured tool output rather than creating ungrounded knowledge.
- **FR-029**: Raw evidence created from tool results MUST follow Raw permission, search, retention, and append-only rules; users lacking Raw access MUST NOT discover it through chat history, proposals, search, or page metadata.

**Audit, safety, and observability**

- **FR-030**: Every tool-management change, tool call, proposal decision, proposal application, and immediate mutation MUST be audit logged with actor, affected resource, safe command metadata, review decision, and outcome.
- **FR-031**: Tool workflows MUST expose recoverable errors to users and operational failures to permitted administrators without leaking protected content.
- **FR-032**: Tool calls that affect public wiki content MUST not change anonymously readable content until the associated durable operation is applied through the normal governed flow.
- **FR-033**: Tool runtime behavior MUST satisfy the invariant: tool calling may automate work, but durable knowledge changes remain permission-scoped, audited, reviewable when policy requires it, and reversible.

### Public Content Delivery *(required when a feature changes anonymously readable published content)*

- This feature does not directly change anonymously readable published content, public metadata, or public navigation merely by enabling tools or running read-only tool calls.
- Public content changes can occur only when an authorized tool mutation is applied or published through the normal governed page flow. Such changes MUST use the existing static/ISR public-content representation and the same invalidation paths/tags used by equivalent manual edits.
- Tool-call progress, proposals, Raw evidence, and retained conversation command records are authenticated surfaces and MUST NOT become part of the cached anonymous reader body.

### Key Entities *(include if feature involves data)*

- **Tool Provider**: A configured source of tools available to Wiki AI. In this phase only the built-in wiki provider is usable; future provider types reuse the same management and policy concepts.
- **Tool Definition**: A user-facing description of an available tool, including purpose, provider, capability category, read/write risk, required permission scope, result-retention policy, enabled state, and review policy.
- **Tool Call**: One assistant-initiated invocation during a chat turn. Carries command markdown, status, actor context, requested review value, effective review decision, safe metadata, and links to resulting proposals, drafts, evidence, or audited mutations.
- **Tool Workflow**: A bounded sequence of tool calls performed during one Wiki AI chat turn to inspect content, reason over results, and answer or prepare changes.
- **Change Proposal**: A reviewable pending mutation for non-page-content changes such as tags, metadata, batch operations, or other state that is not naturally represented by a page draft diff.
- **Review Decision**: An Admin or policy decision that approves, rejects, supersedes, or applies a proposed tool-generated change.
- **Tool Evidence Raw Entry**: A Raw evidence record in the dedicated tool-evidence category preserving or referencing tool output that supports durable knowledge.
- **Conversation Command Record**: The markdown representation of a tool command retained with the conversation, without the full arbitrary tool result payload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In acceptance testing, 100% of enabled read-only wiki tool calls return only content the initiating user is permitted to read.
- **SC-002**: In acceptance testing, 100% of mutating tool calls that require review produce a draft or change proposal and make no durable change before approval.
- **SC-003**: In acceptance testing, 100% of approved proposals re-check current permissions and conflict state before applying.
- **SC-004**: At least 95% of tool workflows involving five or fewer tool calls show progress updates in the chat window within 2 seconds of each tool state change under normal conditions.
- **SC-005**: In acceptance testing, 100% of retained conversations with tool calls include command markdown and safe status metadata, while 0% include full arbitrary tool-result payloads by default.
- **SC-006**: In acceptance testing, 100% of durable AI-generated or AI-updated knowledge that depends on new tool output is traceable to Raw evidence or an existing source revision.
- **SC-007**: In restricted-access tests, users who lose permission after a tool workflow cannot later see protected command details, proposals, drafts, page references, or Raw evidence through chat history.
- **SC-008**: In admin usability testing, an Admin can find the Tools area, identify which mutating tool categories require review, and disable a category in under 60 seconds.
- **SC-009**: In audit review, 100% of tool-management changes, tool calls, review decisions, and applied mutations can be traced to an actor, outcome, and affected resource.
- **SC-010**: In public-content verification, public readers see no content change from a tool-generated proposal until it is approved and applied through the normal governed flow.

## Assumptions

- The first delivery exposes the instance's own wiki-management tools to Wiki AI; registration and execution of arbitrary external MCP providers are deferred to a later feature.
- The word "MCP" in this specification is a product-level interoperability requirement for tool semantics and future extensibility; the planning phase will decide the exact internal invocation path.
- Tool use is available only when Wiki AI is configured with a model/provider combination capable of tool calling.
- Review policy is ultimately server-enforced. The assistant may request whether Admin review is needed, but configured policy can make the effective decision stricter.
- Page-content changes reuse the existing draft, revision, and diff review concepts. Non-page-content changes use a new proposal concept because they do not naturally appear as page diffs.
- Raw evidence capture is required when new tool output becomes source material for durable knowledge. Tool results used only for transient chat reasoning do not have to be stored as Raw evidence.
- Existing conversation capture remains governed by the configured AI Conversations data source. This feature adds command records to retained conversations but does not require full tool-result retention.
- Tool workflows should favor small, inspectable steps over large opaque mutations; bulk operations remain bounded by existing batch-operation limits and review policy.
