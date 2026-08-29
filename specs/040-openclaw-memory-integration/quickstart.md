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

## Verify deliberate shared recall

1. As owner, create a shared namespace and grant one connection read access.
2. Promote selected private evidence to a new curated shared record.
3. Recall using `scope: "granted"` from the granted connection and verify the
   immutable citation is returned.
4. Revoke the grant between candidate selection and response in an integration
   test. The result must be omitted without revealing why.

Neither Hermes nor OpenClaw may write directly to the shared namespace.

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
