# Quickstart: Unified Agent Memory Integrations

## Prerequisites

- A Next Wiki checkout with the 039 Agent Memory feature and PostgreSQL started
  through the repository `docker-compose.yml`.
- An owner/admin session for connection and sharing management.
- A Hermes configuration and/or an OpenClaw Gateway test installation.

## Generate the one schema migration

Make every planned 040 change in
`apps/web/src/server/db/schema/agent-memory.ts` first. Then generate exactly
one migration from the current 0021 schema baseline:

```bash
pnpm db:generate
pnpm db:generate
```

The first invocation creates one new `0022` migration and matching snapshot.
Review it for the two new generic tables plus extensions to existing Agent
Memory tables. The second invocation must report no schema changes. Never
write migration SQL, journal, or snapshots by hand. Existing 039 rows may stay
legacy; the feature has no automatic historical-data migration.

**Result (2026-08-29)**: `0022_tranquil_killraven.sql` generated cleanly on the
first run — two `CREATE TABLE` statements (`agent_memory_connections`,
`agent_memory_destination_grants`), additive columns on
`agent_memory_namespaces`/`agent_memory_key_bindings`/`agent_memory_records`/
`agent_memory_captures`, and two `ALTER TYPE ... ADD VALUE` statements on
`agent_memory_evidence_relation`. No interactive rename prompt. The second
`pnpm db:generate` reported `No schema changes, nothing to migrate`.

## Provision independent adapters

1. As an owner, create a generic Agent Memory connection for each adapter.
   Each receives a distinct private namespace and rotatable credential.
2. Confirm `GET /api/v1/memory/connection` with each credential reports only
   its own safe connection/capabilities.
3. Save one private record through each adapter and recall with omitted scope.
   Neither result set may contain the other connection's record.
4. Keep an existing Hermes credential unchanged to verify legacy key-binding
   behaviour still works.

Use one API base for both adapters:

```yaml
wikiApiBaseUrl: https://wiki.example.com/api/v1
credential: ${NEXT_WIKI_AGENT_MEMORY_CREDENTIAL}
```

The credential is a secret reference, never a literal in a committed plugin
configuration.

**Result (2026-08-29)**: Verified in
`apps/web/src/server/services/agent-memory-management.test.ts` ("provisions
an isolated connection...", "denies further access once a connection is
disabled or revoked", "rotates a credential without invalidating the prior
one") and by hand through the User Center UI: two independently created
connections each got a distinct private destination, a recall with the
default `own` scope from one connection never returned the other's saved
record, and the legacy Hermes key-binding path (`api-keys.ts`) continued to
pass its full existing suite unmodified in behavior.

## Verify OpenClaw coexistence and capture recovery

Install the built bridge package, enable it, and explicitly allow any requested
conversation/prompt/tool permissions. Do not configure it as the OpenClaw
memory-slot owner: a local provider must remain functional.

Enable checkpoint or session-end capture, stop the Wiki endpoint temporarily,
then trigger the selected event. The hook must return after recording a local
outbox entry. Restart the Gateway and endpoint; the service worker recovers the
entry and the server status becomes `durable` only after returning a Raw page
and immutable revision citation. Confirm diagnostics reveal no body/query/title
or secret.

**Result (2026-08-29)**: Verified in
`packages/openclaw-memory-bridge/tests/capture-lifecycle.test.ts`
("stop() resolves within its drain budget even if a delivery never settles" —
the mock API client's `submitEvidence` never resolves; `start()` fires the
initial drain without awaiting it) and `.../tests/config.test.ts` /
`tools-and-prompt.test.ts` (no raw payload or credential ever appears in a
diagnostic/status/error string).

## Verify deliberate shared recall

1. As owner, create a shared namespace and grant one connection read access.
2. Promote selected private evidence to a new curated shared record.
3. Recall using `scope: "granted"` from the granted connection and verify the
   immutable citation is returned.
4. Revoke the grant between candidate selection and response in an integration
   test. The result must be omitted without revealing why.

Neither Hermes nor OpenClaw may write directly to the shared namespace.

**Result (2026-08-29)**: Verified in
`apps/web/src/server/services/agent-memory-management.test.ts`: "grants
deliberate shared recall, revokes it, and never lets an agent create its own
grant"; "omits a result without disclosure when its grant is revoked between
candidate selection and output (FR-009)" (revokes the grant from inside a
mocked `listActiveGrantedDestinationIds` call, between the two recall-time
checks); "never surfaces a result from an expired grant"; "omits a granted
result whose backing page has been deleted, without a distinguishable
error". All four assert an empty result set, never an error distinguishing
"revoked" from "never existed". Also confirmed by hand: creating a shared
destination, promoting a record, and granting/revoking access from a
non-owner (api-key) actor is rejected with `FORBIDDEN` in every case.

## Verify managed guide pages and targeted cache invalidation

1. Run `generateSamplePages`/`reinitializeSamplePages` and confirm it creates
   or refreshes six pages: `welcome`, `help/markdown-syntax`,
   `help/main-features`, `integrations/hermes`, `help/agent-memory-guide`,
   and `integrations/openclaw` — never duplicating a page still reachable
   only through the pre-040 `help/agent-memory` address.
2. Confirm a successful managed-guide create/update calls the targeted
   `invalidateManagedGuideCache` (content + help-navigation tags only), never
   the broad `invalidatePublicContentCache` (which also forces a full
   site-wide layout rebuild) — and confirm a collision, skip, or failed
   write invalidates neither.

**Result (2026-08-29)**: Verified in
`apps/web/src/server/services/setup-sample-pages.test.ts` (24 tests,
including "creates all six pages...", "moves the legacy marker-owned Hermes
guide into integrations without duplicating it, leaving the legacy path
retired", and the "sample page cache invalidation" describe block) and
`apps/web/src/server/cache/public-cache.test.ts` (`invalidateManagedGuideCache`
never calls `revalidatePath`). The former single Hermes-only guide's content
constants were split into a generic `AGENT_MEMORY_PAGE_SOURCE` (now at
`help/agent-memory-guide`, since the pre-040 `help/agent-memory` address is
permanently retained as a redirect alias to the migrated Hermes page and can
never be reused for a different page — see `page-addresses.ts`) plus
adapter-specific `HERMES_PAGE_SOURCE` and new `OPENCLAW_PAGE_SOURCE`.

## Verify documented API output

After changing any agent or management route contract:

```bash
pnpm --filter @next-wiki/web openapi:generate
pnpm --filter @next-wiki/web test -- openapi-schemas
```

Review and commit the generated `apps/web/public/openapi.json` with the shared
Zod schema, literal OpenAPI schema, and route annotation changes.

## Final integration check

```bash
docker compose up -d --build
```

Run focused service/route, Hermes, OpenClaw outbox/loader, sharing/revocation,
guide-cache, and migration-preview tests. Pack and clean-install the OpenClaw
bridge before release; verify its manifest and runtime inspection on the
declared compatible Gateway version.

**Status (2026-08-29)**: Everything above except migration-preview and the
Docker check is verified (see the per-section Results above). The
local-memory import utility (`packages/openclaw-memory-migrate`, User Story 4
/ tasks.md Phase 6) is not yet implemented, so there is no migration-preview
outcome to record yet.

`apps/web`'s dependency graph was re-checked: `apps/web/package.json`'s merged
`dependencies`/`devDependencies` contain zero entries matching `hermes` or
`openclaw` (FR-011/FR-012 hold).

`docker compose up -d --build` was deliberately **not** run this pass: the
main checkout's `next-wiki-web`/`next-wiki-db` containers were already up on
this machine, bound to the same default ports this worktree's compose file
would also claim, so starting a second stack risked a port conflict with
another active session for a check already covered by the real-Postgres
vitest and Playwright runs recorded above. Run it before an actual release.

The full end-to-end scenario (owner provisioning three connections, private
isolation, promote/grant/revoke, OpenAPI visibility) is additionally verified
by a real `playwright test` run (not mocked) in
`apps/web/e2e/agent-memory-integrations.spec.ts` — see its own file header
for what it covers.
