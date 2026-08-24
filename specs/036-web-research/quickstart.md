# Quickstart: Validate Governed Web Research

This guide validates the implemented feature in a local development deployment.
It uses a test connector fixture for automated checks; configure a real Tavily
key only in a private local/admin environment.

## Prerequisites

- Node.js and pnpm versions supported by the repository.
- Docker Desktop/Engine for PostgreSQL and the normal app/worker image.
- An administrator account and a second signed-in user for entitlement checks.
- A Tavily API key only for the optional manual live smoke test. Never place it
  in a browser variable, test fixture, source file, or commit.

## Build and migrate

From the repository root:

~~~bash
pnpm install
docker compose up -d --build
pnpm db:generate
pnpm db:migrate
pnpm db:generate
pnpm lint
pnpm typecheck
pnpm test
~~~

The second db:generate must report no schema changes. If it generates anything,
stop and correct the Drizzle schema/migration workflow; do not edit migration
SQL, the journal, or snapshots by hand.

Regenerate API documentation after route/schema changes:

~~~bash
pnpm --filter @next-wiki/web openapi:generate
~~~

Run focused UI and end-to-end suites with the repository's standard test
environment:

~~~bash
pnpm --filter @next-wiki/web test
pnpm --filter @next-wiki/web test:e2e -- admin-ai-web-research
docker compose up -d --build
pnpm build
~~~

The exact focused Vitest files are introduced with implementation. Automated
tests must use the connector mock/fixture, never a paid live endpoint.

## Administrator setup validation

1. Sign in as an administrator and open the single Admin AI Web Research panel.
2. Confirm the feature is globally disabled and the credential is not displayed.
3. Enter a Tavily key, a safe temporary domain policy, and default bounded
   limits; save. Reload and verify only credentialConfigured is visible.
4. Start a connection test. It must return an action ID immediately, show queued
   and completed status asynchronously, and reveal no query/key/raw body.
5. Grant webResearchEnabled to exactly one non-admin user. Keep another user
   unentitled.

Expected: this configuration adds no page, metadata change, published content,
or durable source record.

## User-flow validation

1. Sign in as the entitled user and open the AI chat.
2. Verify Wiki only is the default mode, visible in restored chat state.
3. Ask a question in Wiki only and inspect outbound connector test telemetry.
   Expected: zero connector calls.
4. Select Wiki first + web. Before sending the first request, verify the
   disclosure identifies the service and says the minimum query leaves the
   Wiki. Dismiss it once; expected: no question action/external call. Confirm
   it on the next attempt.
5. Ask a question intentionally absent or stale in the Wiki. With a fixture or
   approved live local key, expect bounded search/open progress and a response
   within 45 seconds or a clear recoverable outcome.
6. Verify that Wiki citations and External sources are visually distinct.
   External source links open the canonical external URL; candidate snippets
   not opened as evidence do not appear as citations.
7. Refresh/reopen the conversation and confirm the chosen research mode is
   recovered from chat URL/session state.
8. Select Preserve as evidence on one opened external source. Expect a queued
   capture action, then a link to a Raw original source with URL, title,
   provider, retrieval time, and content identity. Confirm no Wiki page was
   edited or published.
9. Attempt capture as a user without evidence-create permission and after
   expiring the fixture source. Expected: safe denied/expired status and no Raw
   placeholder.

## Security and lifecycle regression checks

- Disable the deployment service after queueing, before the worker begins.
  Expected: the worker performs no connector I/O and reports a policy change.
- Revoke the user's web entitlement after queueing. Expected: identical
  no-egress behavior.
- Return an allow-listed and a blocked-domain candidate in a fixture. Expected:
  the blocked one is neither opened nor cited.
- Attempt web_open with a URL, another action's source ID, an expired source ID,
  and a redirect to a blocked host. Expected: rejection before external I/O.
- Return a page that contains tool instructions. Expected: it remains labelled
  untrusted text; no write/draft/publish/evidence tool is available in that
  question action.
- Advance cleanup beyond 24 hours. Expected: unpreserved encrypted bodies and
  temporary source metadata are deleted; a captured Raw source/revision
  remains accessible under its normal permissions.
- Inspect action events and outbound request logs. Expected: no key, full query,
  raw body, Wiki content, cookie, or user identity is present.

## Acceptance summary

The release is ready when:

- Wiki-only, disabled, anonymous, API-key, and unentitled paths have zero web
  egress.
- Eligible, consented users receive bounded, clearly-labelled external evidence
  or an understandable non-destructive failure.
- Capture is explicit, permission-checked, asynchronous, idempotent, and
  provenance-complete.
- The connector can be disabled without affecting ordinary Wiki reading or
  normal Wiki AI questions.
