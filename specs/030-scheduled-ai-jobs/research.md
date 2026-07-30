# Research: Scheduled AI Jobs

## R1 — Reuse a governed workflow primitive, not the chat handler

**Decision**: Extract the model/tool-loop orchestration currently embedded in the tool-enabled Wiki-question worker into a server-only `runGovernedToolWorkflow` primitive. Interactive chat and Scheduled AI Jobs call it with different typed execution inputs; the scheduled input supplies an immutable definition snapshot, a mandatory-review override, and a server-enforced target scope.

**Rationale**: The existing Wiki-question handler owns model selection, prompts, action events, tool policies, bounded loops, evidence, and tool-call audit. Calling that handler unchanged would retain chat/conversation behavior and the Admin immediate-apply exception, neither of which is appropriate for a scheduled job. A small extraction genuinely shares the runtime while preserving the distinct scheduling domain.

**Alternatives considered**:

- Copy the Wiki-question worker: rejected because policy, evidence, cancellation, and model behavior would drift.
- Call the existing handler with a synthetic chat message: rejected because it risks conversation capture semantics and has no hard target-scope boundary.
- Implement a new model/tool runtime: rejected because it violates the requested reuse and duplicates governed behavior.

## R2 — Give scheduled execution its own AI-action feature

**Decision**: Add a `scheduled_ai_job` AI-action feature. Each durable scheduled run creates one linked action with only its run ID as encrypted action input; its history remains in the new run table after normal action/event retention expires.

**Rationale**: A scheduled maintenance execution is neither an interactive question nor a retained conversation. A distinct action feature keeps action auditing, queue selection, failure telemetry, and filters semantically clear while still using the same action lifecycle and tool runtime.

**Alternatives considered**:

- Reuse `wiki_question` with untyped metadata: rejected because it conflates job history with user chat/Raw conversation behavior and obscures administration/audit reporting.
- Omit an AI action: rejected because it would bypass the established model, usage, cancellation, event, and recoverability lifecycle.

## R3 — Use one fixed tick and strict cron with an IANA time zone

**Decision**: Register one pg-boss minute tick. Definitions persist strict five-field cron text, an IANA zone, and UTC `next_run_at`; the tick calculates the next occurrence with direct `cron-parser` dependency and claims due rows transactionally.

**Rationale**: Dynamic pg-boss schedules per definition make edits, removal, restart, time zones, and audit recovery difficult. A database-backed `next_run_at` is queryable, restart-safe, and supports a single operational path. A direct parser dependency is safer than relying on pg-boss's transitive dependency.

**Alternatives considered**:

- Register one pg-boss cron schedule per job: rejected because definitions can change while workers are down and per-job time-zone lifecycle is difficult to reconcile.
- Hand-write cron parsing: rejected because schedule/DST handling is error-prone and a maintained library already exists.
- Accept server-local times: rejected because it breaks portable schedules and clear Admin expectations.

## R4 — Claim runs atomically and coalesce stale occurrences

**Decision**: The due tick advances a definition's `next_run_at` and creates its run in one guarded transaction. A unique `(job_id, scheduled_for)` occurrence key and a partial active-run uniqueness rule protect against duplicate ticks/retries. A definition with an active run records a skipped/deferred occurrence; after downtime the tick records one recovery-skipped summary and moves directly to the next future occurrence instead of replaying a backlog.

**Rationale**: pg-boss delivery is helpful but does not substitute for an application-level execution lease. The database is the source of truth for idempotency and clear run history. Coalescing avoids expensive, obsolete bursts after a long outage.

**Alternatives considered**:

- Depend only on pg-boss singleton delivery: rejected because repeated ticks, restart recovery, and worker retry can still race.
- Run every missed occurrence: rejected because it can amplify costs and prepare stale changes.
- Silently skip missed jobs: rejected because the specification requires accountable history.

## R5 — Preserve wall-clock recurrence with deterministic DST behavior

**Decision**: Validate an IANA time zone with the platform internationalization APIs and calculate occurrences in that zone. A nonexistent spring-forward wall time moves to the parser's next valid instant; a fall-back repeated wall time produces one persisted logical occurrence, protected by the occurrence uniqueness key.

**Rationale**: Administrators configure schedules in local wall-clock time. Persisting UTC alone cannot explain that intent; duplicating an ambiguous hour would violate the no-duplicate-run requirement.

**Alternatives considered**:

- Store only a UTC cron: rejected because local schedule intent changes across DST.
- Reject all DST-adjacent schedules: rejected because it makes ordinary recurring schedules surprising.

## R6 — Treat target scope as a server-enforced policy, not prompt text

**Decision**: Persist a validated target-scope document containing one or more allowed spaces plus optional page-tree roots and tags. Pass it as `ScheduledToolExecutionScope` to every tool executor. Read/search/list output is filtered to the scope, and every write/proposal target is checked against it and the current execution-owner permission context.

**Rationale**: Telling a model not to leave scope is advisory. A capability boundary at the tool executor prevents an instruction injection or model mistake from reading or proposing changes outside the selection.

**Alternatives considered**:

- Put scope only in the task prompt: rejected because it is not authorization.
- Store one row per selected target initially: rejected because the bounded typed JSON scope is not queried independently and avoids a premature workflow/target engine. A future high-volume per-page scheduler can add target items without changing the job/run contract.

## R7 — Force review for every scheduled mutation

**Decision**: Scheduled execution resolves all read tools normally but forces every mutating tool call's effective review decision to `admin_review`. Page content uses existing drafts/revision comparisons; non-page changes use existing tool proposals. Existing proposal apply/reject remains the only durable application boundary.

**Rationale**: The existing runtime allows an Admin actor to apply some operations immediately. That policy is safe for an interactive owner choice but violates the scheduled feature's explicit review boundary.

**Alternatives considered**:

- Rely on the model to ask for review: rejected because a model cannot make authorization decisions.
- Apply low-risk tag changes automatically: rejected because schedule-originated changes must remain inspectable before they affect durable knowledge.

## R8 — Keep definitions/runs durable, actions/events bounded

**Decision**: Job definition text and scope live in a durable definition; a run stores an immutable definition snapshot and bounded result/error/progress summaries. Its linked action/workflow/proposal/evidence records provide detailed short-lived activity. Proposals and page revisions remain durable independently of action cleanup.

**Rationale**: Administrators need long-lived run history even after normal AI action input/event retention. Copying arbitrary tool payloads into scheduling records would reintroduce leakage and unbounded storage.

**Alternatives considered**:

- Use `ai_actions` as the only run history: rejected because action retention and chat-oriented views do not retain a job definition snapshot or skipped occurrences.
- Store full tool results with each run: rejected because results can be large, sensitive, and are not required for review.

## R9 — Use a dedicated scheduled-AI queue and durable recovery

**Decision**: Register `scheduled-ai-tick` and `scheduled-ai-run` queues explicitly. The run queue performs only the child `scheduled_ai_job` action; it has an expiry budget appropriate to the bounded scope. Startup re-enqueues unexpired queued runs and reclaims stale claimed runs only through conditional state transitions. Worker entry calls `runWithoutDataCache` before reaching cached services.

**Rationale**: Recurring maintenance should not starve interactive chat actions. Durable run claims also cover the case where a process stops after a tick has persisted a run but before its queue message is delivered.

**Alternatives considered**:

- Put work on the interactive `ai-action` queue: rejected because a broad scheduled task can delay user work.
- Execute work in the tick: rejected by the async-first rule and makes one delayed job block later due jobs.

## R10 — Provide one Admin route family and reuse existing review surfaces

**Decision**: Make `/admin/ai/jobs` the only management entry, with URL-backed definitions/runs tabs. Use `/admin/ai/jobs/{id}` for a definition and `/admin/ai/jobs/{id}/runs/{runId}` for run detail. Link to the existing tool-proposal and page-diff routes instead of creating a second review screen.

**Rationale**: The jobs view needs deep links, browser history, filtering, and persistent detail. It also must look and behave like existing Admin AI, translation, transfer, action, and proposal views.

**Alternatives considered**:

- Add a competing tab/form to the general `/admin/ai` page: rejected because it crowds the existing configuration screen and duplicates navigation.
- Use modal-only run details: rejected because run state is shareable/auditable and needs a canonical URL.
