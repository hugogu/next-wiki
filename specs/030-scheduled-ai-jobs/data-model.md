# Data Model: Scheduled AI Jobs

## Overview

Scheduled AI Jobs add a small durable scheduling domain around existing AI actions and the governed Wiki AI tool runtime. The definition and run tables record intent, timing, ownership, and long-lived outcome history. They do not store page content, tool result payloads, proposals, or evidence a second time: those remain in existing revisions/drafts, `ai_tool_*`, Raw/source, and audit records.

## New Enums and Shared Types

| Enum / shared type | Values / shape | Purpose |
| --- | --- | --- |
| `ai_action_feature` / `AiActionFeature` | Add `scheduled_ai_job` | Semantically identifies the child AI action. |
| `scheduled_ai_job_status` | `enabled`, `paused`, `retired` | Definition lifecycle. |
| `scheduled_ai_job_run_status` | `queued`, `running`, `completed`, `failed`, `blocked`, `cancelled`, `skipped` | Durable execution lifecycle. |
| `scheduled_ai_job_trigger` | `schedule`, `manual`, `recovery` | Why a run record exists. |
| `ScheduledAiJobScope` | validated spaces with optional page-tree roots and tag filters | Server-enforced boundary for tool execution. |
| `ScheduledAiJobDefinitionSnapshot` | version, task description, cron, time zone, scope, execution owner, policy/model identifiers | Immutable execution context retained with every run. |

All enum and table changes are made in Drizzle schema sources and emitted by `pnpm db:generate`; generated SQL, journal, and snapshot are committed together.

## Entity: ScheduledAiJob

One Admin-managed reusable definition.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | UUID | Primary key. |
| `name` / `normalized_name` | text | Human label; normalized name is unique and supports deterministic duplicate naming. |
| `task_description` | text | Bounded Admin-editable prompt; visible only through Admin views. |
| `schedule_cron` | text | Strict five-field cron, no seconds/aliases. |
| `time_zone` | text | Valid IANA time-zone identifier. |
| `target_scope` | JSON object | Validated `ScheduledAiJobScope`; at least one allowed space/root. |
| `run_as_user_id` | UUID → users | Explicit execution owner; `ON DELETE RESTRICT` so a definition cannot silently lose authority. |
| `status` | enum | `enabled`, `paused`, or `retired`; retiring is a soft state change. |
| `definition_version` | integer | Starts at 1 and increments whenever execution-effective fields change. |
| `next_run_at` | timestamp with time zone nullable | UTC instant owned by scheduler; required while enabled. |
| `last_run_at` / `last_success_at` | timestamp nullable | Display-only denormalization; run records remain authoritative. |
| `last_error_code` / `last_error_message` | text nullable | Bounded safe summary for list UX. |
| `created_by_user_id` / `updated_by_user_id` | UUID → users nullable | Admin audit attribution. |
| `created_at` / `updated_at` / `retired_at` | timestamp | Lifecycle/audit. |

Indexes and constraints:

- unique normalized name;
- partial due index `(next_run_at)` where status is `enabled`;
- owner index `(run_as_user_id)`;
- service validates max length, calendar expression, time zone, eligible active owner, AI eligibility, and at least one currently readable scope target before enabling;
- editing a definition calculates a new `next_run_at` and increments `definition_version`; started runs never read those changes.

## Entity: ScheduledAiJobRun

Permanent record of one scheduled/manual/recovery occurrence.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | UUID | Primary key; queue payload carries only this value. |
| `job_id` | UUID → scheduled job | Parent definition; cascade only after an explicitly authorized future purge, not normal retirement. |
| `trigger` | enum | `schedule`, `manual`, or `recovery`. |
| `scheduled_for` | timestamp with time zone nullable | Logical UTC occurrence. Scheduled/recovery values support idempotency; manual runs carry their request time. |
| `definition_version` / `definition_snapshot` | integer / JSON object | Immutable, display-safe effective definition. |
| `run_as_user_id` | UUID → users nullable | Owner identity captured for audit; live account/role is resolved again before execution. |
| `status` | enum | Lifecycle below. |
| `ai_action_id` | UUID → ai_actions nullable | Linked child `scheduled_ai_job` action; set null only if action cleanup removes it. |
| `tool_workflow_id` | UUID → ai_tool_workflows nullable | Shared tool-runtime record when tool execution begins. |
| `result_summary` | JSON object | Bounded safe counts, conclusion, and permitted draft/proposal/evidence IDs. Never arbitrary result payload. |
| `error_code` / `error_message` / `error_detail` | text nullable | Safe user/Admin output; low-level detail stays in structured logs. |
| `cancel_requested` | boolean | Durable cancellation signal checked before/within execution. |
| `attempt_count` / `lease_expires_at` / `heartbeat_at` | integer / timestamps | Conditional claim/recovery bookkeeping; never exposed as a permission bypass. |
| `queued_at` / `started_at` / `finished_at` | timestamp | Timing/audit. |

Indexes and constraints:

- unique `(job_id, scheduled_for)` where `scheduled_for` is non-null, preventing duplicate due/DST occurrences;
- `(job_id, queued_at desc)` for per-definition history;
- `(status, queued_at)` for recovery;
- partial unique active slot on `job_id` where status is `queued` or `running`, enforcing no overlap;
- check that terminal statuses have `finished_at` and `running` has `started_at` at service transition time.

### Run state transitions

```text
queued -> running -> completed
                 -> failed
                 -> blocked
                 -> cancelled
queued -> blocked | cancelled | skipped
```

- Only `queued -> running` is an atomic conditional claim; duplicate deliveries observe no claimed row and exit.
- `blocked` means current eligibility, scope, model/provider, or tool policy prevented safe execution without making a model call or mutation.
- `skipped` represents a coalesced due occurrence, active-run exclusion, or recovery-summarized stale work. It preserves why the occurrence did not execute.
- Every terminal state is immutable except bounded safe enrichment from the linked action completion; reopening/automatic retry creates a new queued run or action attempt rather than rewriting a result.

## Existing Entities Extended

| Entity | Extension | Invariant |
| --- | --- | --- |
| `ai_actions` | New `scheduled_ai_job` feature, request metadata including scheduled-run ID, standard usage/result/error/events. | The child action is operational telemetry and may expire; the scheduled run remains history. |
| `ai_tool_change_proposals` | Nullable `scheduled_ai_job_run_id` FK plus index. | A proposal has one producing run and survives action cleanup; proposal review/apply remains canonical. |
| Page drafts / revisions | Add safe origin metadata or provenance link to the scheduled run/action using the established draft metadata path. | Content still writes only through normal revision/draft service and retains normal diff/history. |
| `ai_tool_workflows`, calls, evidence links | Reuse as-is, linked through the action/run. | No full result duplication and all reads remain permission-filtered. |
| API audit | Add job/run IDs and safe status metadata to existing audit events. | Audit records identify definition edit, trigger, cancellation, outcome, review and affected resources. |

## Relationships

```text
Admin ── creates/updates ──> ScheduledAiJob
                                  │ 1:N, immutable snapshot
                                  ▼
                           ScheduledAiJobRun ── 0..1 ──> AiAction (scheduled_ai_job)
                                  │                         │
                                  │                         ▼
                                  │                   ToolWorkflow -> ToolCalls
                                  │                         │
                                  ├──> Page Draft / Revision (existing)
                                  ├──> Tool Change Proposal (existing, review required)
                                  └──> Tool Evidence Link -> Raw / Source Revision (existing)
```

## Scope and Snapshot Validation

`ScheduledAiJobScope` is a typed, bounded JSON document, for example a non-empty list of space IDs with optional root page IDs and allowed tag IDs. It contains resource identifiers, not copied content. The definition service validates identifiers/structure and checks the selected execution owner can currently read at least one target before enabling. The runner passes the scope into the executor guard, which validates every page/search result/mutation target against both the scope and the owner's current permission context.

The run snapshot copies the task description, recurrence/time zone, scope, owner ID/display identity, definition version, and relevant model/tool-policy identifiers. It is not retroactively changed by edit, pause, owner change, or retirement. It is a historical record, not an authority snapshot.

## Retention and Rebuildability

- Definitions and run records are durable Administration/audit records; retirement is soft and does not erase history.
- Standard AI action/event input retention remains unchanged. The run stores safe outcome/link summaries so it remains intelligible after child-action cleanup.
- Tool result payloads, model prompts, credentials, and inaccessible material are not copied into scheduling tables.
- `next_run_at`, last-run/list summary fields, recovery leases, and safe counters are derived operational state and can be recomputed from definition/run history. Page indexes, summaries, and citations remain derived from normal revisions/Raw evidence.
