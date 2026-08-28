# OpenClaw Memory Bridge Plugin Contract

## Package and compatibility boundary

The OpenClaw adapter is a separately published ESM package:

- Package: `@next-wiki/openclaw-memory-bridge`
- Plugin ID: `next-wiki-memory-bridge`
- Entry style: native `definePluginEntry` plugin with hooks, optional tools, and a managed service
- Runtime: supported OpenClaw Gateway releases and Node.js versions declared honestly by the package manifest and peer dependency

It is a non-capability plugin. It MUST NOT claim `plugins.slots.memory`, replace an active OpenClaw memory provider, wrap another memory plugin, or depend on private OpenClaw APIs. Local OpenClaw memory therefore remains available independently of the bridge.

The package root MUST contain `openclaw.plugin.json`. The manifest declares startup activation, a strict config schema, the built JavaScript entry point, every runtime tool contract, and matching optional tool metadata. Package release verification validates the manifest, built package, packed archive, and installed runtime inspection.

## Configuration contract

Configuration accepts only transport, local delivery, and explicitly opted-in behavior. The server credential is supplied through OpenClaw's supported secret-reference mechanism; it is never embedded in a plugin manifest, diagnostic, tool result, error, or generated configuration example.

| Setting | Purpose | Security rule |
|---|---|---|
| `wikiApiBaseUrl` | Base URL of the generic v2 memory API | Must use HTTPS outside local development. |
| `credential` | Secret reference for the assigned server connection credential | Maps server-side to an immutable connection; cannot select an identity or destination. |
| `capture` | Enables bounded automatic capture and its allowed lifecycle triggers | Disabled by default. |
| `outbox` | Private state-directory path, size, age, retry, and dead-letter limits | Required for capture; raw payload retention is capped. |
| `externalContext` | Enables authorized prompt enrichment and its result/character limits | Disabled by default; it requires explicit OpenClaw hook permissions. |
| `tools` | Enables optional discovery of search, save, forget, and status tools | Tool allowlisting remains controlled by OpenClaw. |

The configuration has no agent name, namespace, destination ID, grant ID, shared-memory selector, arbitrary server path, or raw logging switch. The server resolves the credential to the stable connection and enforces all destination and grant choices.

Native OpenClaw plugins run in the Gateway process. Installation is therefore an operator trust decision, documented alongside the package's network and local-state behavior.

## Service and local outbox

The plugin registers a service that owns delivery. At service startup it resolves the public OpenClaw state directory, opens a plugin-private durable outbox, recovers non-terminal entries, and reports bounded health diagnostics. At stop it stops new work, aborts active requests, keeps unacknowledged entries for recovery, and attempts only a short bounded flush.

The bridge owns this outbox because a normally distributed third-party plugin cannot rely on privileged bundled-runtime queues. It uses private filesystem permissions, atomic state transitions, a maximum entry count and byte budget, maximum payload age, bounded exponential backoff with jitter, and a quarantined dead-letter state. The local outbox is sensitive transient storage: its documentation declares the machine-at-rest trust boundary and its retention limits.

Each capture event has a deterministic idempotency key and state transition:

```text
pending -> in_flight -> acknowledged
                    -> retryable -> pending
                    -> terminal_failed
```

Network calls are serialized by the outbox worker, not by hook priority. A restart replays only non-terminal entries. The server independently makes the same idempotency key at-most-once and returns the prior durable result when applicable.

## Hooks

Hooks only enqueue, reconcile, or stop local work; they never make completion of a conversation, compaction, or shutdown depend on a remote request.

| Hook or lifecycle | Bridge action | Contract limit |
|---|---|---|
| Gateway start | Start service and recover the outbox. | Reconcile uncertain acknowledgements using the idempotency key. |
| Before compaction | Snapshot an eligible event and persist an outbox entry before returning. | Observation only: cannot rewrite or veto compaction and cannot claim remote durability. |
| After compaction | Record/reconcile the compaction boundary. | Observation only. |
| Agent end | Enqueue an enabled terminal capture. | Fire-and-forget; it is not a delivery acknowledgement. |
| Session end | Enqueue/reconcile an eligible end event for every supported reason. | Must tolerate the shared short shutdown drain. |
| Gateway stop and service stop | Abort worker work and retain unacknowledged entries. | No unbounded flush or network wait in the hook. |

Missing OpenClaw agent, session, or event correlation fields cause a safe skip plus a non-sensitive diagnostic category. They never cause the bridge to invent a server principal, destination, or namespace.

## Optional tools and prompt enrichment

All tool names are static, manifest-declared, and optional:

| Tool | Server operation | Extra local control |
|---|---|---|
| `next_wiki_memory_search` | `POST /api/v2/memory/recall` with an allowed fixed scope | Exposed only after explicit OpenClaw tool allowlisting. |
| `next_wiki_memory_save` | `POST /api/v2/memory/records` | Requires a per-call plugin approval before execution. |
| `next_wiki_memory_forget` | `DELETE /api/v2/memory/records/{recordId}` | Requires a per-call plugin approval; it never hard-deletes source text. |
| `next_wiki_memory_status` | Connection-safe status and local outbox diagnostics | Redacts credentials, content, query, title, and destination names. |

Search accepts no source destination, connection, or grant identifier. Save has no shared target. Forget operates only through the server's connection-based authorization. Sharing, grant changes, promotion, retention changes, and credential rotation are owner/session management operations and are never agent tools.

Automatic prompt enrichment is separately opt-in. The plugin registers the prompt hook with authorized second-phase tool authority, verifies that the search tool is authorized, makes a bounded server recall request, verifies the hook remains active after the await, and returns clearly labelled, prompt-escaped excerpts with immutable citations. It fails open: unavailable, revoked, timed-out, or unauthorized external memory adds no context. It requires both explicit conversation-access and prompt-injection permissions in the OpenClaw entry configuration.

## Capture API behavior

A capture delivery sends an encrypted transient payload to `POST /api/v2/memory/captures`, carrying only the bridge-generated idempotency/event correlation and permitted capture mode. The client reports `durable` only after the response supplies a stable source-page and immutable-revision citation. The bridge then marks the outbox entry acknowledged.

The server writes canonical content through the restricted Raw page/revision writer. Its durable memory projection stores only locators, provenance, digests, status, and idempotency state. A background job receives only a capture identifier; it must never carry raw transcript text in generic queue payload. The encrypted transient input is deleted after durable canonical persistence or bounded expiry.

## Release and verification contract

The package test suite covers configuration parsing and secret redaction, manifest/tool consistency, deterministic event IDs, outbox transitions/recovery/retry/cancellation, safe missing-context handling, prompt bounds and citation escaping, denied/revoked/error paths, tool approvals, and server routing.

Release validation includes loader-backed plugin smoke tests, built-JavaScript validation, package archive inspection, install from a packed archive, and runtime inspection on the declared minimum compatible OpenClaw release and a current supported beta. The bridge and the migration utility each test that they work without a server-side OpenClaw dependency.
