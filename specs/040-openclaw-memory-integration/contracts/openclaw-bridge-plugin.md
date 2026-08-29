# OpenClaw Memory Bridge Contract

**Package**: `@next-wiki/openclaw-memory-bridge`
**Server interface**: [Unified Agent Memory REST Contract](./agent-memory-rest-api.md)

The OpenClaw package is a separately published, ESM, non-capability plugin. It
uses documented plugin hooks, optional tools, and a service worker; it does not
claim `plugins.slots.memory`, replace an installed local-memory provider, call
another plugin's private APIs, or require OpenClaw-specific server state.

## Manifest and configuration

The package root contains `openclaw.plugin.json`; its id matches the ESM
`definePluginEntry` id. The manifest declares strict configuration, startup
activation, every runtime tool, and matching optional tool metadata. Supported
hosts are the first OpenClaw version that supplies every documented SDK surface
used by the bridge.

| Setting | Meaning | Rule |
|---|---|---|
| `wikiApiBaseUrl` | Deployment API root ending in `/api/v1`; the client calls `/memory/*` below it | HTTPS outside local development. |
| `credential` | Secret reference for one connection credential | Never logged or returned in diagnostics. |
| `capture` | Enabled lifecycle capture modes and bounded payload size | Disabled unless the operator opts in. |
| `outbox` | Private state path, TTL/capacity, retry, and dead-letter limits | Required whenever capture is enabled. |
| `promptEnrichment` | Authorized optional external recall policy and bounds | Disabled unless explicit hook/tool permissions are enabled. |

## Capture and delivery

`before_compaction`, `after_compaction`, `agent_end`, and `session_end` are
observation hooks. They synchronously validate and durably enqueue a
deterministic local outbox item, then return without waiting for the network.
They cannot veto compaction or truthfully promise remote durability. Gateway
start recovers non-terminal items; gateway/service stop aborts active requests,
keeps unacknowledged entries, and performs only a small bounded best-effort
drain.

The plugin-owned outbox is required because ordinary third-party plugins cannot
depend on privileged bundled runtime queues. It has restrictive filesystem
permissions, encrypted payloads where platform support is available, atomic
state transitions, bounded exponential retry with jitter, entry/byte/age caps,
and a quarantined terminal-failure state. It documents that transient content
remains on the operator-controlled machine until acknowledged or expired.

Each delivery calls `POST /api/v1/memory/evidence` with a deterministic event
idempotency key and permitted `captureKind`. The server resolves the stable
connection from the credential, selects the private destination, and returns
`durable` only once a restricted Raw source page and immutable revision exist.
The bridge may reconcile an uncertain request by that same idempotency key.

## Recall, tools, and permissions

Optional static tools are `agent_memory_search`, `agent_memory_save`,
`agent_memory_forget`, and `agent_memory_status`. They are invisible until the
operator allows them. Search uses bounded `POST /api/v1/memory/recall` with an
explicit permitted scope; save/forget require a per-call plugin approval and
remain subject to server authorization. Tools never offer grants, destination
selection, promotion, credential rotation, or retention configuration.

Automatic prompt enrichment is optional. It requires conversation access and
prompt-injection permissions, runs only via the documented authorized
second-phase prompt hook, checks tool authority before and after the bounded
server request, escapes retrieved text, and attaches clearly labelled immutable
citations. Missing identity/session correlation causes safe capture skip or
diagnostic status, never a guessed server principal.

## Interoperability and release checks

The bridge works alongside the existing Hermes provider because both use the
same generic v1 service. It has no server dependency on an OpenClaw package;
Hermes remains an optional adapter, not a feature prerequisite.

Tests include configuration/secret redaction, outbox state/recovery, capture
idempotency, cancellation, permission denials, prompt bounds, two-connection
isolation, and loader-backed plugin smoke coverage. Release validation builds
the package, validates the manifest, packs and clean-installs it, and runs
runtime inspection on the declared compatible OpenClaw version.
