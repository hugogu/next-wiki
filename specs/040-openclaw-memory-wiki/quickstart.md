# Quickstart: Validate OpenClaw Memory Wiki Integration

**Feature**: [OpenClaw Memory Wiki Integration](./spec.md)
**Related artifacts**: [data model](./data-model.md),
[REST contract](./contracts/openclaw-memory-wiki-rest-api.md), and
[plugin contract](./contracts/openclaw-plugin-contract.md)

This guide validates the released integration end to end. Use a disposable Wiki
and vault. Never place real API keys in shell history, committed configuration,
fixtures, screenshots, or Markdown source.

## Prerequisites

- This branch, Node.js, pnpm, Docker, and Docker Compose are available.
- A supported OpenClaw Gateway host using Node.js 22.22.3+ can read a local
  fixture vault and reach the Wiki deployment.
- The implementation package has been built, or an approved published package
  exists. Use the package's compatibility matrix for the supported OpenClaw
  versions.
- The Wiki host has a fresh/disposable PostgreSQL environment and an Admin
  owner. **LLM Wiki** writing mode is enabled so the restricted Raw space is
  available.
- A remote deployment uses HTTPS and an address resolvable from the OpenClaw
  host/container; do not use the Wiki host's loopback address from another
  container.

## 1. Start a Disposable Wiki

```bash
docker compose up -d --build
```

Complete `/setup` and create the initial Admin. Verify the service is reachable
from the OpenClaw host. An unauthenticated Memory API response is sufficient to
prove network routing; do not attach a real bearer key to a diagnostic command.

## 2. Generate and Inspect Setup Guidance

During setup, select **Generate example pages**. Confirm:

1. `integrations/openclaw` is published and contains placeholder-only
   OpenClaw installation, generic Agent Memory provider key, sync, retrieval,
   rotation, and diagnosis
   guidance.
2. Welcome and Main Features link to `integrations/openclaw` and retain their
   existing links, including the separate Hermes integration guide.
3. Rerunning setup generation does not add a revision for unchanged
   marker-owned pages.
4. Reinitializing sample pages from Admin → Spaces restores a soft-deleted
   managed OpenClaw guide and refreshes it when required.
5. A user-authored page at `integrations/openclaw` is reported as a collision
   and remains byte-for-byte unchanged.
6. Public reader pages retain normal static/ISR delivery and reveal no
   connection, secret, or sync status.

## 3. Provision the Agent Memory Provider Connection

In **User Center → API Keys**, choose the generic **Memory provider** preset
and create one key with `agentIdentity: openclaw`. Select the scopes needed by
this installation:

- `memory.read` / `memory.write` for Memory Wiki synchronization and Agent Memory;
- `view` for next-wiki search and selected page reads;
- `raw` and/or `generated` space access only when this Admin owner wants the
  plugin to retrieve those spaces. Wiki is always included.

Copy the single secret once into the OpenClaw SecretRef store using the
OpenClaw-approved secret flow. Record only its non-secret label. The key list
shows one key bound to the OpenClaw destination with all selected scopes.

Test safe negative paths before configuring the plugin:

| Scenario | Expected outcome |
| --- | --- |
| Key without `view` calls knowledge search | `403`; no page title, path, or excerpt leaks. |
| Key without `memory.write` calls document upsert | `403`; no Raw page/revision is created. |
| A key from a different owner/namespace is used | Connection validation rejects it. |
| Raw/Generated permission is removed after setup | Search coverage changes safely and hidden results disappear. |
| The connection key is revoked | All plugin capabilities become degraded on their next call. |

## 4. Create a Fixture Memory Wiki Vault

Create a disposable vault that mirrors the documented Markdown layout:

```text
fixture-vault/
├── AGENTS.md
├── WIKI.md
├── index.md
├── inbox.md
├── entities/alex.md
├── concepts/retry-policy.md
├── syntheses/customer-summary.md
├── sources/interview.md
├── reports/privacy-review.md
├── _views/overview.md
├── _attachments/ignored.pdf
└── .openclaw-wiki/ignored-state.json
```

Give at least one document frontmatter, an internal relative Markdown link,
and a body unique to each document. Include a document that will later change.
The two ignored files prove that attachments and runtime state cannot cross the
mirror boundary.

## 5. Build, Pack, and Install the Plugin

From the repository root, build the package and validate the user-facing
archive shape:

```bash
pnpm --filter @next-wiki/openclaw-memory-wiki build
npm pack --pack-destination /tmp --workspace @next-wiki/openclaw-memory-wiki
openclaw plugins install npm-pack:/tmp/<packed-plugin>.tgz --force
openclaw plugins inspect next-wiki-memory-wiki --runtime --json
openclaw skills list
```

The runtime inspection must identify the compiled plugin entry and all four
declared tools. `openclaw skills list` must identify the packaged `next-wiki`
Skill. A missing `dist` file, manifest, normal dependency, or Skill directory
is a release blocker.

## 6. Configure Without Exposing Secrets

Configure the plugin through normal OpenClaw configuration and one SecretRef. Use
a placeholder reference, not the literal key value:

```json5
{
  plugins: {
    entries: {
      "next-wiki-memory-wiki": {
        enabled: true,
        config: {
          baseUrl: "https://wiki.example.test",
          apiKeyRef: { source: "env", provider: "default", id: "NEXT_WIKI_API_KEY" },
          vaultPath: "/absolute/path/to/fixture-vault",
          syncIntervalMinutes: 1
        }
      }
    }
  }
}
```

Restart or reload the Gateway as required by the selected OpenClaw release,
then run:

```bash
openclaw plugins inspect next-wiki-memory-wiki --runtime --json
openclaw agent --message "Use next-wiki status and report only its safe state."
```

Expected result: status reports a validated configured root, safe connection
state, timing/counters, and no literal secret, Markdown body, query, response
body, or local vault content.

## 7. Validate Initial Mirror and Reconciliation

Use the explicit optional sync tool (or wait for the first background scan):

```bash
openclaw agent --message "Use next-wiki sync, then report the created, updated, unchanged, and failed counts."
```

As the Wiki owner, inspect the restricted Raw entries and verify:

1. Every eligible fixture Markdown file appears once under the server-derived
   OpenClaw raw root, with the original relative source path retained in
   provenance.
2. The source tree remains recognizable even where raw routing normalizes
   uppercase names or removes `.md`; `AGENTS.md`, `WIKI.md`, root documents,
   and every standard directory remain traceable.
3. Body, frontmatter, and relative links match the source exactly. Attachments
   and `.openclaw-wiki` state are absent.
4. A second scan with unchanged files reports only `unchanged` and creates no
   additional Raw revision.
5. Change `concepts/retry-policy.md`, rerun a scan, and confirm one new full
   Raw revision whose current body equals only the new file snapshot—not a
   concatenation of both versions.
6. Simulate a transport failure, restore connectivity, and confirm retry
   converges without duplicate page/revision creation. Local Memory Wiki use
   and normal OpenClaw replies must continue while next-wiki is unavailable.

Inspect audit history. It may show the operation, endpoint, key label, status,
and duration, but must not include document title/path/body, source digest,
query, excerpt, or key value.

## 8. Validate Retrieval and the Bundled Skill

Seed additional readable content in all three next-wiki spaces:

- a normal Wiki page containing a personal preference;
- a Generated page containing a project summary;
- a restricted Raw page containing other-agent evidence.

Then ask an OpenClaw agent a query that requires all three:

```bash
openclaw agent --message "Search next-wiki for the retry policy and user preferences. Cite the relevant sources and say if any content-space coverage is restricted."
```

Verify that the agent:

1. searches before opening a result and reads only selected references;
2. returns bounded excerpts/results with space, title, path, and revision
   citation;
3. distinguishes source facts from its own inference;
4. reports incomplete coverage if the key lacks Raw or Generated permission;
5. returns a truthful empty result for no match; and
6. does not follow instructions embedded in a retrieved Markdown document.

For the reduced-coverage check, revoke this key and provision a replacement
connection key without the Raw and Generated grants. Repeat the query; it must
expose only permitted Wiki results, with no hidden metadata. Use a second
next-wiki owner and that owner's connection key to prove neither mirror nor
retrieval can access the first owner's data through modified plugin inputs.

## 9. Automated Verification

Run focused checks during development and the full suite before merge:

```bash
pnpm --filter @next-wiki/web test -- agent-memory
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
pnpm --filter @next-wiki/web openapi:generate
pnpm --filter @next-wiki/openclaw-memory-wiki test
pnpm --filter @next-wiki/openclaw-memory-wiki typecheck
pnpm --filter @next-wiki/openclaw-memory-wiki lint
pnpm test
pnpm typecheck
pnpm lint
docker compose up -d --build
```

Focused coverage must include:

- shared schemas and OpenAPI shape; Drizzle generated migration and snapshot;
- scoped generic Agent Memory provider-key creation, same-owner binding, rotation, revocation, disabled
  owner, per-scope denial, and no accidental cross-account grant;
- path validation, case collisions, root confinement, full Markdown snapshot
  integrity, same-digest no-op, changed-digest revision history, concurrent
  upsert, and retention on source removal;
- route no-store/error/audit redaction plus Raw/Generated search coverage,
  empty results, cross-account isolation, and page-read reauthorization;
- vault scanner eligibility/stability, journal recovery, idempotency, retry,
  safe status, tool policies, manifest validation, and packaged Skill wording;
- sample-page create/refresh/restore/collision behavior, public cache
  invalidation, English/Chinese copy, and setup Playwright coverage; and
- `npm-pack:` installation, OpenClaw runtime inspection, Skill discovery, and
  real Docker Compose mirror/search smoke coverage.

## 10. Release Readiness

Before publishing an `openclaw-memory-wiki-v*` tag:

1. Build and install the exact tarball into clean minimum-supported, current
   stable, and current beta OpenClaw hosts.
2. Run manifest/config validation, runtime inspection, Skill discovery, and
   the fixture-vault mirror/search journey against Docker Compose next-wiki.
3. Verify generated OpenAPI, README, in-product guide, audit snapshots, and
   package contents for accidental secret or protected-content disclosure.
4. Run `clawhub package publish <approved-org>/<package> --dry-run`. Perform
   the actual ClawHub publication only when the project has approved ownership
   and release credentials.
5. Confirm the normal next-wiki image and Compose deployment start without
   installing OpenClaw, Node 22 tooling, or any plugin-specific background
   service.
