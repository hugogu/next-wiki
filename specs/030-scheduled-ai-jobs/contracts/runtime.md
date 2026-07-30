# Runtime Contract: Scheduled AI Jobs

## Entry and queue ownership

1. The registered `scheduled-ai-tick` queue runs once each minute. It calls `tickScheduledAiJobs(now)` only; it never calls a model or tool.
2. The service parses enabled definitions in their stored IANA time zones, claims due occurrences atomically, advances `next_run_at`, records a `ScheduledAiJobRun` snapshot, and enqueues its ID to the explicit `scheduled-ai-run` queue.
3. The run worker enters `runWithoutDataCache`, conditionally claims `queued -> running`, resolves the current execution owner, creates/uses the linked `scheduled_ai_job` action, and invokes the shared governed workflow primitive.
4. Queue retry/recovery is secondary protection. Database occurrence/active-slot constraints and conditional state transitions are authoritative. At startup, recoverable queued/stale runs are re-enqueued; stale missed schedules are coalesced into a visible skipped recovery record.

## Shared workflow input

The extracted primitive accepts an explicit execution mode:

| Input | Interactive Wiki AI | Scheduled job |
| --- | --- | --- |
| Actor | Current initiating user | Current active execution owner resolved from run snapshot ID |
| Instruction | Chat question + conversation/current-page context | Saved task description + immutable definition snapshot summary |
| Scope | Normal current chat context/permissions | `ScheduledToolExecutionScope`, enforced by executors |
| Review policy | Existing effective policy | Read calls unchanged; every mutation forced to `admin_review` |
| Action feature | `wiki_question` | `scheduled_ai_job` |
| Output | Chat answer/events | Bounded run result + action events + drafts/proposals/evidence links |
| Conversation capture | Existing question configuration | No chat/conversation record is created solely for the schedule |

The primitive still resolves provider/model availability, tool registration and policies, bounded call count/timeouts, tool-call event records, cancellation, citations, evidence, and usage with the existing services. It does not accept arbitrary executable code or an arbitrary external tool.

## Execution gates

Before a model call, and before every durable output, the runner must verify:

1. Definition is not retired and the run has not been cancelled.
2. Execution owner still exists, is active, and has current Wiki AI entitlement.
3. AI mode, selected provider/model capability, and required registered tools are currently available.
4. Saved scope is structurally valid and every accessed resource is both in scope and readable/writable by the live owner context.
5. The shared workflow/action has not reached its configured cancellation, tool-call, or execution-time limit.

Failure at a gate becomes a safe `blocked`, `cancelled`, or `failed` run outcome and emits no hidden fallback action.

## Scope guard

`ScheduledToolExecutionScope` is passed from the run service to the executor boundary, not only rendered into model text.

- Search/list/read results are filtered before they reach the model or run detail.
- Page drafts, metadata/tag operations, link proposals, and tag-merge candidates validate every target against allowed spaces, roots, tags, and live permissions.
- A scope denial returns a safe structured tool failure. The model may continue with permitted work but cannot infer the denied resource's content or existence beyond normal permission-safe behavior.
- Creating arbitrary new pages, arbitrary scripts, external providers, and out-of-scope resources are not enabled by this feature.

## Durable outputs and provenance

- Page-content changes create existing draft/revision comparisons only.
- Non-page mutations create existing proposals with forced requested/effective review `admin_review`; no scheduled code calls proposal apply.
- A scheduled proposal gets `scheduled_ai_job_run_id`; a draft carries equivalent origin metadata/link. The run accumulates only safe IDs/counts/URLs.
- When a conclusion or proposal depends on new tool source material, existing Raw/source evidence capture/linking rules apply before a durable change can proceed.
- Every result read rechecks permission for linked page, proposal, draft, command, and evidence data. Child action cleanup must not remove the permanent run record or proposal provenance.

## Cancellation, conflict, and completion

Cancellation is a durable run/action signal checked between planner and tool steps. It cannot roll back a completed draft/proposal, approve work, or erase audit history. A proposal/revision is later approved/rejected/applied through its existing surface, which rechecks current state, reviewer permission, conflict hashes, versioning, and public invalidation. The run reaches `completed` when the shared workflow reaches a safe terminal answer/proposal state; it does not wait for a human review decision.
