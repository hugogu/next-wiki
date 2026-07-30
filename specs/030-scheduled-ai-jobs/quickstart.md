# Quickstart: Scheduled AI Jobs

## Prerequisites

1. Check out branch `030-scheduled-ai-jobs` and install workspace dependencies after the scheduled dependency change.
2. Start the project and database with the repository workflow:

   ```bash
   docker compose up -d --build
   ```

3. Create an active Admin test account and, if testing delegated execution, an active AI-entitled Editor/Admin with a readable/editable test space.
4. Configure an enabled text AI provider/model that supports the existing Wiki AI tool capability. Enable only the tool categories needed by the test.
5. Create at least two test pages, plus a tag/proposal test case. Keep one protected page outside the selected job scope.

## Definition and schedule smoke test

1. Sign in as Admin and open `/admin/ai/jobs?tab=jobs`. Confirm the page uses the normal Admin layout and no duplicate Jobs entry appears elsewhere.
2. Create a paused job with a name, task instruction, strict five-field cron, IANA time zone, selected scope, and execution owner. Verify invalid cron/time zone/empty scope produce inline errors.
3. Enable it and confirm the human-readable schedule and `nextRunAt` are shown in the selected time zone.
4. Edit its task/schedule/scope, then open a prior run after one exists. Confirm the earlier run shows its immutable original snapshot.
5. Pause and retire a job. Confirm no future run begins and its definition/history remains readable.

## Shared runtime and review smoke test

1. Create a scoped “find related pages / propose tags” job and select **Run now**. Confirm the request returns a queued run promptly and does not wait for model work.
2. Open the run detail while active. Confirm status advances through normal polling and links to its child AI action/tool workflow only through safe Admin information.
3. Confirm all pages returned to the model are inside the saved scope and accessible to the current execution owner. Attempt an out-of-scope/protected target; verify it is blocked/redacted without content disclosure.
4. Confirm page-content suggestions become normal drafts/diffs and non-page suggestions become normal tool proposals. Verify no page, tag, link, merge, or publication changes before explicit reviewer action.
5. Approve/apply a proposal using the existing proposal page. Verify permission/conflict checks still run, and public-page changes follow the normal publish/invalidation workflow.
6. Disable the selected owner, AI feature, provider/model capability, or relevant tool policy before a run. Confirm the run is safely blocked with no model call or durable mutation.

## Scheduling, concurrency, and recovery smoke test

1. Set a near-future schedule and verify the central tick creates exactly one run for the logical occurrence.
2. Trigger Run now while a run is queued/running. Confirm the second occurrence is visibly skipped/deferred and no concurrent execution starts.
3. Test an IANA zone around a daylight-saving transition. Confirm a spring missing time advances consistently and a repeated fall hour creates no duplicate logical run.
4. Stop/restart the worker after a run record is persisted. Confirm recoverable work is re-enqueued once; after a long simulated outage, confirm stale work is coalesced/recorded rather than replayed as a burst.
5. Cancel a queued/running run. Confirm later steps stop where possible, created drafts/proposals stay auditable, and nothing is approved/applied automatically.

## Verification commands

Run focused checks during implementation, then the affected package/project checks:

```bash
pnpm db:generate
pnpm --filter @next-wiki/web openapi:generate
pnpm --filter @next-wiki/web i18n:validate
pnpm --filter @next-wiki/web test -- scheduled-ai-jobs
pnpm --filter @next-wiki/web test -- ai-tool
pnpm --filter @next-wiki/web test -- ai-actions
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web test:e2e -- scheduled-ai-jobs
pnpm db:generate
```

The final `pnpm db:generate` must report no schema changes. Any migration must be generated from Drizzle schemas, never hand-authored. Perform browser automation against the Admin jobs CRUD, URL restoration, active status, access denial, and proposal-only change boundary; use Docker Compose PostgreSQL for integration/E2E verification.
