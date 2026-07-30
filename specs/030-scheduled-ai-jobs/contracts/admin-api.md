# Admin API Contract: Scheduled AI Jobs

All routes are authenticated Admin-only routes under `/api/ai`. They use the established API context, `manage_ai` permission check, Zod request/response schemas from `packages/shared`, standard error envelope, API audit metadata, and `Cache-Control: no-store`. API-key and anonymous actors are denied. Route handlers stay thin over the scheduled-jobs service.

Every added/changed route is annotated for the repository's OpenAPI generator; regenerate the documented specification rather than editing generated JSON directly.

## Job Definitions

### `GET /api/ai/scheduled-jobs`

Returns a paginated definition collection.

Query parameters: `q`, `status`, `limit`, `offset`.

Each item contains ID, name, status, cron/time zone plus human-readable schedule, scope summary, execution-owner summary, definition version, next/last run times, last safe outcome, and canonical detail URL. It does not expose raw action input, tool payloads, or inaccessible resource names.

### `POST /api/ai/scheduled-jobs`

Creates a paused or enabled definition.

```json
{
  "name": "Find related payment pages",
  "taskDescription": "Inspect the selected pages and propose useful links.",
  "scheduleCron": "0 3 * * *",
  "timeZone": "Asia/Shanghai",
  "targetScope": {
    "spaceIds": ["uuid"],
    "rootPageIds": ["uuid"],
    "tagIds": []
  },
  "runAsUserId": "uuid",
  "status": "enabled"
}
```

Returns `201` with the definition view and first `nextRunAt`. Invalid cron/time zone, unavailable owner, empty/inaccessible scope, duplicate name, or unavailable AI configuration return explicit validation/domain errors and do not enable the job.

### `GET|PATCH|DELETE /api/ai/scheduled-jobs/{id}`

- `GET` returns the editable definition and a safe latest-run summary.
- `PATCH` accepts execution-effective partial fields, validates a complete resulting definition, increments version, and recalculates `nextRunAt` when appropriate. It never mutates a started run's snapshot.
- `DELETE` is a soft retirement: no future occurrence starts, active work receives cancellation where possible, and definition/run history stays readable to Admins.

### `POST /api/ai/scheduled-jobs/{id}/duplicate`

Creates a paused copy with a collision-free copy name, new ID/version, no inherited run history, and a recalculated next occurrence only after it is enabled.

## Runs

### `POST /api/ai/scheduled-jobs/{id}/runs`

Creates a manually triggered run with trigger `manual`; returns `202` and the run resource. It uses the same snapshot, active-slot restriction, queue, owner recheck, forced-review policy, and history lifecycle as a scheduled occurrence.

If another run is queued/running, the response returns the resulting skipped/deferred run or a stable domain conflict according to the active-slot service decision; it never starts concurrent work.

### `GET /api/ai/scheduled-jobs/{id}/runs`

Returns paginated history for one definition. Filters: `status`, `trigger`, `limit`, `offset`.

### `GET /api/ai/scheduled-job-runs`

Returns paginated cross-job recent history for the Jobs “Runs” tab. Filters: `jobId`, `status`, `trigger`, `q`, `limit`, `offset`.

### `GET /api/ai/scheduled-jobs/{id}/runs/{runId}`

Returns a durable run detail:

```json
{
  "id": "uuid",
  "jobId": "uuid",
  "status": "completed",
  "trigger": "schedule",
  "scheduledFor": "2026-07-31T19:00:00.000Z",
  "definitionSnapshot": {
    "version": 3,
    "name": "Find related payment pages",
    "schedule": "0 3 * * *",
    "timeZone": "Asia/Shanghai",
    "scopeSummary": "Payments / descendants",
    "executionOwner": { "id": "uuid", "displayName": "Owner" }
  },
  "startedAt": "2026-07-31T19:00:03.000Z",
  "finishedAt": "2026-07-31T19:00:24.000Z",
  "outcome": { "summary": "Prepared 2 link proposals", "proposalCount": 2 },
  "action": { "id": "uuid", "status": "completed", "usage": {} },
  "links": [{ "kind": "proposal", "id": "uuid", "href": "/admin/ai/tools/proposals/uuid" }]
}
```

Links and evidence are resolved/redacted at read time. The response excludes arbitrary tool output, credentials, encrypted inputs, model prompts beyond the saved definition, and inaccessible content.

### `POST /api/ai/scheduled-jobs/{id}/runs/{runId}/cancel`

Requests cancellation for a queued/running run and its child action. Returns the updated run state. It cannot reject/apply existing drafts or proposals, and it is idempotent for terminal runs.

## Error Codes

| Code | Meaning |
| --- | --- |
| `SCHEDULE_INVALID` | Cron expression is unsupported, too frequent, or has no next occurrence. |
| `TIME_ZONE_INVALID` | Time-zone identifier is invalid. |
| `SCHEDULED_JOB_NAME_CONFLICT` | Normalized job name already exists. |
| `SCHEDULED_JOB_OWNER_INELIGIBLE` | Owner is inactive or lacks AI eligibility. |
| `SCHEDULED_JOB_SCOPE_INVALID` | Scope is structurally invalid, empty, or cannot be read by its owner. |
| `SCHEDULED_JOB_RETIRED` | Operation cannot create a new run for a retired definition. |
| `SCHEDULED_JOB_ACTIVE_RUN` | A concurrent run is already queued/running. |
| `SCHEDULED_JOB_RUN_NOT_FOUND` | Run is not part of the specified job or is not visible. |
| `SCHEDULED_JOB_RUN_NOT_CANCELLABLE` | Run is already terminal. |
| `SCHEDULED_SCOPE_VIOLATION` | A tool call attempts to access or propose a resource outside the saved scope. |

Existing `FORBIDDEN`, `NOT_FOUND`, `AI_DISABLED`, entitlement, tool-policy, evidence, and proposal-conflict errors retain their current safe mapping. Server routes return no implementation diagnostics.
