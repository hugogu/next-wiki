# Quickstart: Validate Agent Memory Provider

> The Wiki API is client-neutral: use `/api/v1/memory/*`. Hermes is the first
> client; configure its required `agent_identity` (default `hermes`) when
> creating the Memory provider key. The identity is enforced server-side and is
> never accepted as a route or tool argument.

**Feature**: [Agent Memory Provider](./spec.md)
**Related contracts**: [REST API](./contracts/hermes-memory-rest-api.md) and [data model](./data-model.md)

This guide is the end-to-end validation path for the implementation. It uses
placeholder values only; do not paste a real API key into shell history, issue
trackers, screenshots, or configuration committed to source control.

## Prerequisites

- A supported Hermes release from the provider compatibility matrix and Python
  3.11+ on the Hermes host.
- A checkout of next-wiki on branch `039-hermes-memory-provider` with Node,
  pnpm, Docker, and Docker Compose available.
- A fresh or disposable PostgreSQL-backed Wiki environment. First-run setup must
  create an Admin owner before an API key can be issued.
- A reachable Wiki URL from the Hermes process. A host-local address must not be
  used from a different container unless the containers share a reachable
  network. Remote deployments must use the deployment's HTTPS address.

## 1. Start a Disposable Wiki

```bash
docker compose up -d --build
```

Open the service URL, complete `/setup`, and sign in as the initial Admin.
Enable the **LLM Wiki** writing mode so the shared Raw space is available for
immutable memory entries. A separate Wiki AI model provider is not required for
the Hermes API path or its bounded lexical recall.

Confirm health from the environment that will run Hermes:

```bash
curl -i https://wiki.example.test/api/v1/memory/connection
```

An unauthenticated response is expected at this point. A DNS, transport, or
reverse-proxy failure must be corrected before configuration continues.

## 2. Generate and Read the In-Product Guide

During initial setup choose **Generate example pages**. Verify that:

1. `integrations/hermes` is published under the virtual `integrations` folder
   with placeholder-only installation and security guidance.
2. The generated Welcome next-steps block and Main Features page link to it.
3. Rerunning generation does not create an additional revision.
4. A user-authored page at the same address is reported as a collision and is
   not changed.
5. On an installation generated before the integrations path was introduced,
   the marker-owned `help/agent-memory` page is moved to
   `integrations/hermes` without creating a duplicate; a user-authored legacy
   page remains untouched.
6. The Wiki space's Admin → Spaces reinitialize action restores soft-deleted
   marker-owned examples and refreshes their current content without reopening
   setup; user-authored pages remain untouched.

The public reader document must remain static/ISR under the normal Wiki
delivery path. It must not include any logged-in provider configuration,
destination name, API key, capture state, or diagnostic output.

## 3. Provision a Dedicated Hermes Key

In **User Center → API Keys**, choose the Agent Memory integration option:

1. Create a new private Memory Destination for the Hermes profile. For a shared
   test, deliberately choose an existing owner-managed destination and create a
   second dedicated key; never reuse one broad key for two profiles.
2. Grant `memory.read`, `memory.write`, and `memory.delete` for the complete
   write/forget scenario. Create a separate read-only key to test denial paths.
3. Reveal/copy the key only into a secure password manager or the interactive
   Hermes setup prompt. Record the non-secret destination label for comparison
   with `status` output.

Verify the public API documentation describes the new scopes and Agent Memory
resources. The key must not need generic page, Raw, Generated, or AI scopes for
the baseline provider flow.

## 4. Install and Configure the Provider

Install the built wheel or the published package on the Hermes host:

```bash
python -m pip install next-wiki-hermes-memory
```

Use the normal Hermes picker as the preferred path:

```bash
hermes memory setup
hermes memory status
```

Choose `next-wiki`, enter the non-secret versioned API base URL, and enter the
key only in Hermes's secret prompt. Confirm the generated configuration contains
the base URL and `capture_enabled: false` but no API key. The setup field is
deliberately off by default; selecting **yes** enables asynchronous capture of
eligible user/assistant evidence after each completed turn.

Validate without changing configuration:

```bash
next-wiki-hermes-memory init --wiki-url https://wiki.example.test/api/v1 --dry-run
hermes next-wiki status
hermes next-wiki check
```

Expected results:

- `init --dry-run` shows the files/actions it would prepare and writes nothing.
- `status` performs no network I/O and prints only non-secret URL, destination,
  config version, capture preference, and secret-set state.
- `check` reports an active destination and all required memory scopes without
  returning page content or credentials.

## 5. Validate Explicit Recall, Save, and Forget

1. In Hermes, ask it to save a concise decision through
   `next_wiki_memory_save`.
2. Inspect the Wiki as the owner: a restricted, published Raw entry under the
   **Agent Memory** system category and a corresponding active Memory Record
   exist. The entry is machine-attributed, immutable, not public, and is handed
   to the common page/index reconciliation pipeline.
3. Start a fresh Hermes session under the same profile and ask a related
   question. `prefetch` or `next_wiki_memory_search` returns only bounded
   destination records with page/revision citations.
4. Start a Hermes session configured with a different private key/destination.
   The first profile's record must not be returned, enumerable, or mutable.
5. Ask Hermes to forget the saved memory. Confirm it disappears from future
   Hermes recall while the original Raw page/revision and source text remain
   unchanged; audit/history remains available to the owner.

## 6. Validate Opt-In Capture and Checkpoints

Enable `capture_enabled` through the documented non-secret config path (or the
setup prompt), restart/reload Hermes, and start a new session. Hold a
conversation containing only disposable text.

1. Complete a turn and verify the turn finishes without waiting for the Wiki.
2. Poll the provider/job status until a restricted Evidence Record and an
   immutable Raw backing revision become durable. Verify the Agent Memory
   category and common indexing path through the owner-authorized Wiki surface.
3. Complete another eligible turn in the same Hermes session. It must append a
   second immutable revision to the same Raw conversation page and keep one
   logical Evidence Record. The status citation for each capture must identify
   that capture's own revision.
4. Repeat the same request or simulate a retry. The same destination and
   idempotency digest must return one capture/result, not duplicate evidence or
   create another revision.
5. Confirm system messages, assistant tool calls, tool result payloads, API
   secrets, delegated contexts, and raw session IDs were not captured. The
   provider's `status` command reports the capture preference but does not prove
   that a worker has persisted a capture; use the Raw entry and Admin Access Log
   for that verification.

For a Hermes host that advertises v2 checkpoint capability, explicitly enable
the strict checkpoint option and Hermes's required-checkpoint configuration.
Force the Wiki worker to be unavailable for a test capture. Expected result:
compression is blocked with a recoverable failure and no partial checkpoint is
reported. Restore the worker, retry the same normalized evidence, and verify one
durable result. Do not enable strict checkpoints on a Hermes version that lacks
the detected contract.

## 7. Validate Revocation, Scope, and Error Safety

| Scenario | Expected outcome |
|---|---|
| Revoke the active Hermes key | The next call returns a safe unauthorized diagnostic; no further recall/write occurs. Existing pages remain intact. |
| Use a key without `memory.write` | Save/evidence endpoints return `AGENT_MEMORY_SCOPE_REQUIRED`; no page/revision is created. |
| Use a memory ID from another destination | Forget returns `AGENT_MEMORY_RECORD_NOT_FOUND`; no existence information leaks. |
| Disable the bound destination | Connection and operations return `AGENT_MEMORY_NAMESPACE_UNAVAILABLE`. |
| Use incompatible provider version | Connection/diagnostics return `AGENT_MEMORY_INCOMPATIBLE_CLIENT` with upgrade guidance only. |
| Redirect, timeout, invalid URL, or container-loopback address | Bootstrap/doctor report a specific repair action and do not print secret or response bodies. |

Inspect API Audit entries for each scenario. Entries must show the generic
origin `agent_memory`, the client integration in bounded operation metadata,
safe endpoint/outcome/correlation metadata, and never reveal content, query,
profile labels, or secrets.

## 8. Automated Verification

Run focused checks while developing, then the full workspace suite before merge:

```bash
pnpm --filter @next-wiki/web test -- agent-memory
pnpm --filter @next-wiki/web typecheck
pnpm --filter @next-wiki/web lint
python -m pytest packages/hermes-memory-provider/tests
pnpm test
pnpm typecheck
pnpm lint
docker compose up -d --build
```

Focused coverage must include:

- shared schemas/OpenAPI and public error mapping;
- API-key scope/binding creation, revocation, disabled users, and namespace
  isolation;
- save/update revision history, evidence links, soft forget, idempotency, and
  AI-disabled lexical recall;
- route authentication, cross-destination non-disclosure, capture job polling,
  audit redaction, and worker `runWithoutDataCache` behavior;
- provider entry-point/config-schema/CLI discovery, no-network availability,
  safe JSON tool results, session switching, non-blocking capture, and strict
  checkpoint retry/failure;
- first-run four-page generation, public cache invalidation, idempotency,
  default-space collision behavior, English/Chinese copy, and Playwright setup
  flow;
- wheel build/install and compatibility fixtures for the minimum and latest
  supported Hermes releases.

## 9. Release Readiness

Before publishing a `hermes-memory-provider-v*` tag:

1. Build the Python wheel from `packages/hermes-memory-provider` and install it
   into a clean Hermes test environment.
2. Run discovery, `hermes memory setup`, `status`, `check`, and the three tool
   flows against a Docker Compose Wiki.
3. Run provider compatibility CI for the recorded minimum and current Hermes
   versions; capture upstream version/commit fixtures in test metadata.
4. Review public docs, generated Help source, README examples, OpenAPI output,
   and audit snapshots for accidental credentials or protected data.
5. Verify the working tree has only intended changes, generated Drizzle
   migration snapshots are present, and the normal Compose deployment still
   starts without installing Python or configuring Hermes.
