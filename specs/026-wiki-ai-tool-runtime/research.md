# Research: Wiki AI Tool Runtime

## R1 — Internal tool provider, MCP-compatible semantics

**Decision**: Implement the first phase as a built-in `next-wiki` tool provider registered inside the web app, with MCP-compatible names, input schemas, and result envelopes. Do not self-call the packaged MCP server from the web process.

**Rationale**: The web app already owns the permission context, page/tag/raw services, AI action lifecycle, and transaction boundaries. Self-calling the MCP package would add local transport, credentials, deployment, and error-handling complexity while still needing server-side policy enforcement. Using MCP-compatible metadata keeps future external providers possible without forcing the first phase through an unnecessary loop.

**Alternatives considered**:

- Launch and call the existing MCP server from the web container: rejected because it adds deployment/process coupling and API-key impersonation complexity.
- Call public REST endpoints directly from the tool loop: rejected because internal services already provide safer permission context and transaction control.
- Invent non-MCP tool names: rejected because it would make future external MCP providers harder to align.

## R2 — Tool loop inside the Wiki question action

**Decision**: Keep tool-enabled chat under the canonical `wiki_question` action feature. Whether the answer used tools is an execution detail represented by `ai_tool_workflows`, tool-call events, and tool/proposal/evidence records tied to the action.

**Rationale**: From the product and retention perspective, a user asked Wiki AI a question. Tool use is an internal answering strategy and should not fork Raw capture, session history, citations, Feishu bot context, usage reporting, or deletion/review semantics. The workflow table carries the extra lifecycle state without creating a parallel AI history path.

**Alternatives considered**:

- Add a separate `wiki_tool_chat` action feature: rejected because it duplicates session history, Raw capture, citations, bot context, and audit/reporting behavior for what is semantically the same Wiki AI question. Kept only as a legacy enum value for rows created before unification.
- Store tool workflows outside `ai_actions`: rejected because it would create a parallel AI history path.

## R3 — Model capability gate

**Decision**: Treat tool use as a model capability that can be discovered or manually overridden, and block tool workflows when the selected model lacks it.

**Rationale**: Existing provider/model governance already has capability discovery and purpose assignment. Tool calling is not universally supported, so exposing a clear unavailable state prevents hidden out-of-band operations.

**Alternatives considered**:

- Let the server simulate tool planning for models without tool support: rejected because tool calls would not be visible in the model's reasoning flow.
- Require only Anthropic-style tool support: rejected by P2/P9 vendor independence.

## R4 — Server-enforced review policy

**Decision**: Tool calls carry `requestedReview`, but the server computes `effectiveReview` from tool category, actor, resource, risk, and Admin configuration. The effective policy can only be stricter than the request.

**Rationale**: The model may request whether review is needed, but policy cannot be delegated to the model. Server enforcement supports "AI requested no review, policy requires review" and "AI requested review, policy allows immediate apply" safely by choosing the stricter outcome.

**Alternatives considered**:

- Trust the assistant-provided review flag: rejected as an authorization bypass.
- Make all mutations review-required forever: rejected because low-risk owner-only workflows may later be configured for immediate application.

## R5 — Page drafts for page content, proposals for non-page changes

**Decision**: Represent page-content changes as drafts/proposed revisions using existing diff tooling. Represent tag, metadata, batch, and other non-page mutations as `ToolChangeProposal` records with typed items.

**Rationale**: Page diffs already satisfy review for source content. Tags and metadata can affect multiple resources and do not always map to a single page revision; they need a first-class proposal surface with conflict detection and apply/reject states.

**Alternatives considered**:

- Encode tag changes as artificial markdown diffs: rejected because global tag operations are not page-local and would be misleading.
- Apply tags immediately and rely on audit logs: rejected because spec requires Admin review when policy requires it.

## R6 — Conversation retains commands, not arbitrary results

**Decision**: Retained Conversation records include markdown command records, safe status metadata, and links to proposals/evidence, but do not store full arbitrary tool-result payloads by default.

**Rationale**: Tool results vary in size, structure, and sensitivity. Command records make the assistant's actions understandable while avoiding unbounded chat-history growth and accidental leakage.

**Alternatives considered**:

- Store every tool result in Conversation history: rejected because payloads may be huge or sensitive.
- Store no tool information in Conversation history: rejected because users need traceability of what the assistant did.

## R7 — Raw evidence is mandatory for durable sourced tool output

**Decision**: If new tool output influences durable knowledge, preserve that output or a sufficient source artifact as Raw evidence under a system Tool Evidence category, or link to an existing page/Raw revision that already contains the same source.

**Rationale**: Constitution v2.3.0 requires evidence-first self-growth. A generated page or tag proposal based on transient tool output would otherwise be ungrounded.

**Alternatives considered**:

- Rely only on command metadata: rejected because command metadata cannot reconstruct source evidence.
- Always Raw-capture every tool result: rejected because many results are transient and not used for durable knowledge.

## R8 — External MCP provider activation deferred

**Decision**: Model provider identity, transport type, risk, and policy fields now, but make only the built-in wiki provider usable in this phase.

**Rationale**: External MCP providers introduce secret management, process/network transports, trust boundaries, and result-retention decisions. The first phase should prove governed internal tool use before expanding the attack surface.

**Alternatives considered**:

- Build external MCP registration immediately: rejected as too broad for this spec.
- Ignore future providers entirely: rejected because the user explicitly requested design extensibility.

## R9 — Tool results stay permission-filtered at every read

**Decision**: Tool-call display, proposal detail, evidence links, and retained conversation history re-check permissions on read, not only at execution time.

**Rationale**: Permissions can change after a workflow completes. A user should not keep seeing protected command details, page links, or Raw evidence simply because they once initiated a workflow.

**Alternatives considered**:

- Snapshot all displayable tool details at execution time: rejected because it leaks after permission revocation.
- Hide all completed tool details from non-admins: rejected because users need safe progress/history visibility.

## R10 — Public content changes follow existing publication mechanics

**Decision**: Tool-generated changes to public pages have no anonymous effect until an approved proposal is applied/published through existing page mutation and public revalidation paths.

**Rationale**: P12 requires anonymous published content to remain static/ISR and invalidated explicitly. Tool proposals are authenticated workflow objects, not public content.

**Alternatives considered**:

- Let approved proposals directly patch cached public pages: rejected because it bypasses normal revision and invalidation behavior.
- Store tool-generated public variants separately: rejected because it creates a second-class content path.
