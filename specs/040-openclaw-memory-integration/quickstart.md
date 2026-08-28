# Quickstart: OpenClaw Externalized Memory

This guide verifies the planned integration in a development or staging environment. It intentionally uses two server connections to demonstrate that sharing is an owner-granted server capability, not an OpenClaw configuration choice.

## Prerequisites

- A Next Wiki deployment with the generic v2 Agent Memory API, owner management UI, and database migration applied.
- A running OpenClaw Gateway on a version supported by the bridge package.
- Node.js at the bridge package's declared compatible version, initially Node.js 22.22.3 or later supported OpenClaw release line.
- Two separately provisioned OpenClaw agents and an owner account in Next Wiki.
- HTTPS for the Wiki API outside local development.

For a local application environment, start the project database and application with:

```sh
docker compose up -d --build
```

Do not use an OpenClaw agent identity, a namespace, a destination ID, or a shared-memory target in the plugin configuration. The server owns those mappings.

## Provision two isolated connections

1. As the Wiki owner, create connection A and connection B in User Center > Agent Memory.
2. Confirm that each connection has a separate primary private destination.
3. Issue one rotatable credential for each connection and place it in the Gateway's supported secret-reference facility.
4. Install and enable the same bridge package for both agents.
5. Keep capture and automatic prompt enrichment disabled initially.

An illustrative non-secret configuration is:

```yaml
plugins:
  entries:
    next-wiki-memory-bridge:
      enabled: true
      hooks:
        allowConversationAccess: false
        allowPromptInjection: false
      config:
        wikiApiBaseUrl: https://wiki.example.com/api/v2
        capture:
          enabled: false
        externalContext:
          enabled: false
        outbox:
          maxEntries: 1000
          maxBytes: 52428800
```

Configure the credential via the supported secret-reference field described by the package schema, rather than adding a literal token to this file.

Install and inspect the package using the OpenClaw release's supported commands, for example:

```sh
openclaw plugins install clawhub:@next-wiki/openclaw-memory-bridge
openclaw plugins enable next-wiki-memory-bridge
openclaw plugins inspect next-wiki-memory-bridge --runtime --json
```

The inspection must report an accepted manifest, startup service, optional tools, and no credential value.

## Verify private writes and recall

1. Allow the optional `next_wiki_memory_save` and `next_wiki_memory_search` tools for agent A.
2. Save one explicit factual memory through agent A and approve that one save call.
3. Search for it through agent A. The result must include a stable immutable revision citation.
4. Search for it through agent B. The result must omit it and must not reveal whether it exists.
5. Confirm the owner audit view records only the bounded operation, outcome, correlation, connection, and destination references; it must not show a query, title, excerpt, captured payload, session digest, or credential.

Repeat the save with the same idempotency key and verify that it returns the first result instead of producing a second record. Attempt to save directly to shared memory or by passing a destination identifier; both must be rejected by the plugin schema and server contract.

## Verify owner-managed sharing and revocation

1. As the owner, create a read grant from A's selected source destination to connection B.
2. Search through B using the allowed recall scope. B now receives the cited external result.
3. Revoke the read grant, then repeat the same search. B receives no candidate, citation, count, or grant-specific error.
4. Create a write grant only if the intended product flow exposes it. Without that explicit active grant, a shared write must be denied.
5. Promote an evidence-backed private record only from the owner/session management flow. Verify that promotion creates a new attributable curated record and immutable evidence link; it does not mutate or implicitly share the original.

Disable A, rotate its credential, and retry an old delivery. A disabled connection must be denied even if an old credential still exists. A still-active connection with a newly rotated credential must recover pending work without changing identity.

## Enable and verify capture

1. Enable the package capture setting for a small approved set of lifecycle events.
2. Enable the necessary OpenClaw conversation-access permission.
3. Trigger a compaction, session end, or agent end event.
4. Confirm the hook returns after persisting a local outbox entry, without waiting for network delivery.
5. Confirm that a successful server result becomes durable only when it includes a source-page and immutable-revision citation.
6. Restart the Gateway while an entry is retryable. On start, the service resumes the entry idempotently.
7. Stop the Gateway while a request is active. The entry remains recoverable; no hook claims it was saved merely because the hook ran.

Before-compaction capture is best effort and observation-only. It does not veto compaction or establish a strict remote durability barrier.

Inspect only diagnostic counters and categories. Local outbox inspection, logs, and errors must not reveal transcript body, search query, page title, session digest, endpoint credentials, or raw server response.

## Enable and verify automatic external context

1. Explicitly enable prompt injection and conversation access for the bridge entry.
2. Allow the optional search tool under the relevant OpenClaw tool authority.
3. Enable `externalContext` with conservative result and character limits.
4. Trigger a prompt that should find an entitled result.
5. Confirm the injected material is bounded, clearly labelled as external memory, prompt-escaped, and contains immutable citations.
6. Revoke the grant or disable the source before a follow-up prompt. The bridge must omit the result rather than exposing a stale cached excerpt.

The bridge does not call or replace OpenClaw local-memory tools. Disable external context and verify that local memory behavior remains unchanged.

## Run a safe migration preview

Use the separate `@next-wiki/openclaw-memory-migrate` utility, not the continuous bridge:

1. Select the source data locally and run a preview.
2. Review the detected record count, fingerprints, omissions, and retention implications.
3. Approve the run explicitly.
4. Interrupt and resume it; the local encrypted ledger must prevent duplicate imports through deterministic idempotency keys.
5. Verify no source file is deleted, moved, or changed.

Imported records use normal generic server writes with `origin=import`; their source paths and arbitrary local metadata are never sent as a free-form server capability.

## Automated verification

Before implementation merge, run the commands applicable to the changed packages:

```sh
pnpm db:generate
pnpm db:generate
pnpm --filter @next-wiki/web test -- agent-memory
pnpm --filter @next-wiki/openclaw-memory-bridge test
pnpm --filter @next-wiki/openclaw-memory-migrate test
pnpm --filter @next-wiki/openclaw-memory-bridge build
docker compose up -d --build
```

The second migration generation must report no further schema changes. Package release CI additionally runs loader-backed OpenClaw smoke tests, validates the manifest and packed archive, installs the archive into a clean compatible Gateway, and verifies runtime inspection.
