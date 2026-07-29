# Agent Runtime

This document describes the implemented Wiki AI Agent Runtime: the tool-enabled branch of the `wiki_question` action. It is a durable, permission-scoped, bounded tool-calling workflow, rather than a separate always-on autonomous agent service.

Ordinary Wiki AI questions use the same action, queue, provider, retrieval, event, and retention foundations, but stream a single answer without entering the tool loop.

## Architecture

```mermaid
flowchart LR
    user["Signed-in user"]
    chat["Wiki AI chat<br/>AiChatPane + use-ai-action"]
    questionApi["POST /api/ai/questions"]
    actionService["AI action service<br/>permission + model capability checks<br/>encrypt input and create action"]
    actionDb[("PostgreSQL<br/>ai_actions<br/>ai_action_inputs<br/>ai_action_events")]
    queue["pg-boss<br/>ai-action queue"]
    worker["AI action worker<br/>runAiAction"]

    subgraph runtime["Wiki AI Agent Runtime"]
        questionJob["Tool-enabled question job<br/>retrieval + runtime settings"]
        policy["Tool registry and policy<br/>enabled tools + strictest review"]
        workflow["Bounded tool loop<br/>plan, persist, execute, feed result back"]
        planner{"Planner strategy"}
        native["Native function calling"]
        text["Fenced YAML/JSON text protocol"]
        executor["Tool executors<br/>existing permission-checked services"]
        skills["Enabled Agent Skills<br/>load_skill on demand"]
    end

    provider["Configured AI provider<br/>provider adapter"]
    knowledge["Wiki retrieval<br/>full context or vector search"]
    wiki["Wiki services<br/>content, tags, metadata, images"]
    toolDb[("PostgreSQL<br/>ai_tool_workflows<br/>ai_tool_calls<br/>policies, proposals, evidence")]
    sse["GET /api/ai/actions/:id/events<br/>SSE polling stream"]

    user --> chat --> questionApi --> actionService
    actionService --> actionDb
    actionService --> queue --> worker --> questionJob
    questionJob --> knowledge
    questionJob --> policy
    questionJob --> skills
    questionJob --> workflow
    workflow --> planner
    planner --> native --> provider
    planner --> text --> provider
    workflow --> executor --> wiki
    workflow <--> toolDb
    worker --> actionDb
    actionDb --> sse --> chat
```

Key boundaries:

- The request handler only validates input, creates an `ai_action`, encrypts the turn payload, and enqueues its ID. It returns `202 Accepted`; it does not call an AI provider synchronously.
- The pg-boss worker registers feature handlers at boot and dispatches the action. A restart re-enqueues recoverable actions.
- The runtime offers only policy-enabled tools to the planner. It resolves the effective review decision on the server, under the initiating user's `PermCtx`; a model cannot expand the user's permissions or weaken review.
- Tool executors reuse existing application services. Reads return bounded model-facing results; writes produce drafts, proposals, or audited immediate mutations according to the effective policy.
- The UI consumes the durable action-event log through SSE. The stream can reconnect using its last event ID, so it is not coupled to one HTTP request.

## Tool-enabled turn lifecycle

```mermaid
sequenceDiagram
    actor User
    participant UI as Wiki AI chat
    participant API as Questions API
    participant Actions as Action service and DB
    participant Boss as pg-boss
    participant Worker as AI action worker
    participant Runtime as Tool runtime
    participant Model as AI provider
    participant Tools as Permission-checked tools
    participant Events as SSE event stream

    User->>UI: Ask question with tools enabled
    UI->>API: POST /api/ai/questions
    API->>Actions: Validate session, entitlement, page, model capability
    Actions->>Actions: Store encrypted input and queued action event
    Actions->>Boss: Enqueue actionId
    API-->>UI: 202 actionId and eventsUrl
    UI->>Events: Connect with EventSource

    Boss->>Worker: Deliver ai-action job
    Worker->>Actions: Check cancellation, AI enabled, user active, then mark running
    Worker->>Runtime: Load question, retrieval sources, policies, skills
    Runtime->>Runtime: Create or resume workflow, then set running

    loop Until final answer, cancellation, or max calls
        Runtime->>Model: Prompt and enabled tool catalogue
        alt Native tool strategy
            Model-->>Runtime: Structured tool call(s)
        else Text protocol or native fallback
            Model-->>Runtime: Fenced YAML/JSON tool call(s), or final text
        end

        alt Model returns final answer
            Runtime->>Runtime: Complete workflow
        else Model requests a tool
            Runtime->>Runtime: Resolve tool, enabled state, review, and call limit
            Runtime->>Actions: Persist tool-call event
            Runtime->>Tools: Execute under initiating user's permission context
            Tools-->>Runtime: Safe bounded result, draft, proposal, or failure
            Runtime->>Actions: Persist call state, audit, and lifecycle event
            Note over Runtime: Result is appended to the planner transcript, while full arbitrary results are not persisted.
        end
    end

    Runtime->>Actions: Persist answer, citations, usage, terminal status
    Actions-->>Events: New ordered events available
    Events-->>UI: text, tool lifecycle, citations, completed/error
    UI-->>User: Render answer and governed tool activity
```

## Guardrails and terminal paths

The loop runs sequentially and is capped by `maxCalls` from the provider default policy or runtime setting. Each call is recorded before execution. Unknown or disabled tools are recorded as `blocked`; failed tools are returned to the model as safe failure text; successful results are truncated before they are appended to the next planning prompt.

The workflow reaches `completed` when the planner emits a final answer, `limit_reached` when another call would exceed its cap, and `cancelled` when the durable action cancellation flag is observed. Provider failures mark the workflow failed (or cancelled) and the outer action handler records the final error state. pg-boss retry behavior applies only to retryable normalized provider failures.

The durable record intentionally separates concerns:

| Record | Purpose |
| --- | --- |
| `ai_actions` / `ai_action_inputs` | Request lifecycle and encrypted input retained for the configured event window. |
| `ai_action_events` | Ordered, permission-checked event source for streaming and session reconstruction. |
| `ai_tool_workflows` / `ai_tool_calls` | State machine and bounded audit trail for each tool-enabled turn. |
| Tool proposals and evidence links | Reviewable non-page mutations and provenance that may outlive action cleanup. |

## Relevant implementation entry points

- `apps/web/app/api/ai/questions/route.ts` — accepts questions and selects the tool-enabled path when requested.
- `apps/web/src/server/services/ai-actions.ts` — durable action creation, queueing, event persistence, cancellation, and cleanup behavior.
- `apps/web/src/server/jobs/register.ts` and `apps/web/src/server/jobs/ai-actions.ts` — worker registration and feature dispatch.
- `apps/web/src/server/jobs/ai-question.ts` — retrieval, planner strategy, workflow setup, final answer, citations, and usage persistence.
- `apps/web/src/server/services/ai-tool-runtime.ts` — workflow/call state transitions and the bounded execution loop.
- `apps/web/src/server/services/ai-tool-policy.ts` and `apps/web/src/server/services/ai-tool-executors.ts` — policy enforcement and permission-scoped execution.
