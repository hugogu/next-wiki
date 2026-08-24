# Research: Governed Web Research

## Decision 1: Use a first-party connector in v1, not model-hosted search

**Decision**: Introduce a server-only WebResearchConnector registry and ship its
Tavily implementation first. Register web_search and web_open as existing
next-wiki built-in tools. Do not make hosted web search from OpenAI or Anthropic
a v1 execution path, and do not represent Tavily as external MCP.

**Rationale**: The existing runtime uses OpenAI-compatible Chat Completions plus
a provider-neutral function-tool loop. OpenAI's complete hosted-search
experience is a Responses API tool with its own result annotations and execution
events. Anthropic's server tool has different continuation, encrypted-result,
and client-tool interleaving rules. Directly exposing either would make the
tool loop, citations, retention, accounting, and safety rules provider-specific.
A connector preserves one project-owned egress, citation, policy, and evidence
model across configured LLMs.

**Alternatives considered**:
- OpenAI Responses web search: rejected for v1 because it would require a
  second LLM-provider protocol and special annotation handling.
- Anthropic web search: rejected for v1 because pause/continuation and opaque
  result replay are incompatible with a simple common tool result.
- Generic external MCP: rejected because the current external-MCP provider is
  intentionally inactive, cannot carry encrypted connector credentials, and
  would not give the application enough egress/policy control.
- Browser automation or arbitrary fetch: rejected because it expands SSRF,
  credential, crawling, and prompt-injection exposure beyond the feature scope.

**Sources**: [OpenAI web search guide](https://developers.openai.com/api/docs/guides/tools-web-search),
[OpenAI function calling guide](https://developers.openai.com/api/docs/guides/function-calling),
[Anthropic web search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool),
[Anthropic server tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools).

## Decision 2: Search first, then open selected opaque sources

**Decision**: A connector search returns no more than five normalized candidates
with snippets. The tool loop may select and open at most three action-scoped
opaque source IDs. It may never pass a URL to a web-open tool.

**Rationale**: Searching before extraction reduces irrelevant page retrieval,
allows domain policy filtering before any source is considered evidence, and
lets the project retain a stable source identity. Opaque IDs prevent a model or
client from turning the connector into a general URL fetcher.

**Alternatives considered**:
- Return full page bodies from search: rejected for excessive cost, latency, and
  retention exposure.
- Accept URL in web_open: rejected for SSRF/open-redirect risk and bypass of
  candidate/domain policy.
- One combined search-and-answer vendor endpoint: rejected because vendor prose
  is not auditable primary evidence and duplicates the project's model answer.

**Sources**: [Tavily search API](https://docs.tavily.com/documentation/api-reference/endpoint/search),
[Tavily recommended extract flow](https://help.tavily.com/articles/3363168593-extracting-web-content-using-tavily),
[Tavily extract API](https://docs.tavily.com/documentation/api-reference/endpoint/extract).

## Decision 3: Use explicit conservative Tavily request parameters

**Decision**: Search uses basic depth, max_results 5, one chunk per source, no
provider answer, no raw content, no images, and disabled auto-parameter
selection. Extract uses basic depth, Markdown format, one to three chunks,
query-assisted ranking, no images/favicon, and a 10-second bounded timeout.
The application enforces two searches and three extracts per turn.

**Rationale**: These settings keep pricing, latency, and output volume
predictable. Provider-generated answers would obscure source-level citations,
and raw output needlessly expands sensitive transient retention. Advanced
settings become a future explicit policy option, not an implicit fallback.

**Alternatives considered**:
- Advanced depth by default: rejected for higher cost/latency on ordinary chat.
- Auto parameters: rejected because it can silently choose a deeper, more
  expensive search.
- Provider answer: rejected because the Wiki AI remains responsible for the
  final grounded response.

**Sources**: [Tavily search API](https://docs.tavily.com/documentation/api-reference/endpoint/search),
[Tavily parameter guidance](https://help.tavily.com/articles/7879881576-optimizing-your-query-parameters),
[Tavily extract API](https://docs.tavily.com/documentation/api-reference/endpoint/extract).

## Decision 4: Separate web-research settings from LLM providers

**Decision**: Keep one deployment-level WebResearchSettings record represented
by encrypted fields on the existing singleton AI settings in v1, with provider
identifier tavily and a static connector registry. Do not add it to the model
provider table.

**Rationale**: The model provider table and adapter factory represent chat,
embedding, and image capabilities. A search connector has different credentials,
costs, capabilities, and policy controls. A singleton keeps the initial
implementation simple while the registry permits a future connector selection
without changing citations or captured evidence.

**Alternatives considered**:
- Add Tavily to aiProviders: rejected because it would misrepresent a search
  service as a model and overload model lifecycle code.
- Add generic connector/provider tables now: rejected as premature abstraction
  for one service and one deployment configuration.
- Environment variable only: rejected because administrators need controlled
  enablement, testing, policy, and key rotation through the existing UI.

## Decision 5: Make external citations a discriminated union

**Decision**: Evolve the shared citation contract into WikiCitation and
WebCitation. Old persisted citations without a kind are read as Wiki citations.
A WebCitation includes sourceId, canonicalUrl, title, provider, retrievedAt,
and optional publishedAt/contentHash. UI links external citations directly to
their canonical URL with appropriate external-link handling.

**Rationale**: Existing citations assume a page ID and revision hash. Preserving
a typed distinction prevents an external page from appearing to be durable Wiki
knowledge, permits future connectors, and lets historical conversations render
without migration.

**Alternatives considered**:
- Overload the Wiki citation with nullable page fields: rejected because it
  erodes invariants throughout rendering and provenance code.
- Persist vendor-native citation shapes: rejected because source rendering and
  evidence would become vendor-coupled.
- Store full body in citation events: rejected because events have larger
  retention and size limits than temporary evidence permits.

## Decision 6: Treat web material as untrusted, read-only tool data

**Decision**: In web mode, build a tool allow-list of permitted Wiki read tools
and web_search/web_open only. Delimit and size-bound extracted content in tool
results, explicitly instruct the planner to treat it as data, and exclude all
write/proposal/publish/metadata/evidence-capture tools. The user alone begins
a separate capture action.

**Rationale**: Prompt-injected web pages must not be able to acquire authority
through the model. A structural tool-profile boundary is stronger than relying
on prompt wording. Minimal query construction from the original user question
also avoids letting the model disclose retrieved private Wiki text to search.

**Alternatives considered**:
- Use the normal enabled-tool list in web mode: rejected because it co-exposes
  write capabilities to untrusted content.
- Rely only on prompt instructions: rejected because prompts cannot enforce
  authorization.
- Let model call capture_tool_evidence: rejected because capture is durable,
  user-significant, and the current declaration has no executor.

## Decision 7: Re-check policy at egress and retain only minimum data

**Decision**: Creation checks research mode, user consent, session actor,
entitlement, and service state. Every search and extract repeats the global
enablement, entitlement, cancellation, budget, and source-policy checks
immediately before outbound I/O. Store an encrypted bounded body only in an
expiring source record; a separate privacy-safe attempt record retains only
actor/service/outcome/policy/usage fields. Events and outbound logs remain
redacted and contain no body.

**Rationale**: Queue delay makes a creation-time policy snapshot stale. This
prevents a disabled service or revoked user from making an external call after
a job was queued. It also enforces the 24-hour ephemeral-content guarantee.

**Alternatives considered**:
- Check only when the API action is created: rejected due to queue-time
  time-of-check/time-of-use gaps.
- Keep all data in AI action events: rejected because event retention defaults
  to longer than 24 hours and payloads have a 128KB limit.
- Keep search results indefinitely for debugging: rejected because it conflicts
  with privacy minimization and creates a second knowledge store.

## Decision 8: Preserve selected evidence through a queued trusted writer

**Decision**: A user-selected source capture creates a web_evidence_capture
AI action. Its worker verifies source ownership, non-expiry, capture permission,
and content status before using a dedicated writer to create a Raw original
source with input kind external-fetch. The source row stores the resulting Raw
page/revision ID; capture is idempotent.

**Rationale**: Capture can take longer than a request and must not be performed
by an untrusted web tool or automatically by a model. Reusing Raw preserves the
project's existing original-versus-generated distinction and page revision
semantics.

**Alternatives considered**:
- Auto-capture every opened source: rejected by the explicit-capture and
  privacy requirements.
- Store evidence solely in an AI table: rejected because it bypasses normal
  source provenance and durability semantics.
- Treat the temporary URL as an existing tool-evidence link target: rejected
  because that relation requires real durable source/revision anchors.

## Decision 9: Expose privacy and operational limits explicitly

**Decision**: The first web request in a conversation shows the configured
service name and explains that the minimal search query leaves the Wiki. The
application sends neither cookies nor user/page/conversation identity headers,
and masks credentials/query body in standard outbound logging. It surfaces
budget, rate-limit, unavailable, empty, policy-blocked, cancelled, and expired
states as recoverable outcomes.

**Rationale**: Tavily advises server-side secret management and its privacy
notice explains that query data can be shared with third-party indexes when
needed. Users must know when their question leaves the deployment, while
administrators need enough safe observability to operate the feature.

**Sources**: [Tavily API key management](https://docs.tavily.com/documentation/best-practices/api-key-management),
[Tavily privacy policy](https://www.tavily.com/privacy),
[Tavily API introduction](https://docs.tavily.com/documentation/api-reference/introduction),
[Tavily usage API](https://docs.tavily.com/documentation/api-reference/endpoint/usage).

## Decision 10: Test via fixtures and enforce lifecycle regressions

**Decision**: Use deterministic connector fixtures for successful results,
timeouts, malformed data, 429, and policy-excluded URLs. Add worker tests that
disable the feature after queueing, tests for no egress on Wiki-only/ineligible
requests, retention/capture tests, shared contract compatibility tests, and
E2E coverage from admin configuration through external citation and capture.

**Rationale**: It validates the product-level contract without spending credits,
depending on the open web, or storing production-like research content in
tests.

**Alternatives considered**:
- Live integration tests against Tavily: rejected for cost, rate limits, test
  instability, and secret exposure.
- Connector-only tests: rejected because the most important risks cross
  entitlement, job, tool, citation, retention, and UI boundaries.
