# Research: OpenClaw Shared Memory Bridge

**Feature**: [OpenClaw Shared Memory Bridge](./spec.md)

**Date**: 2026-08-28

## D1: Add a generic v2 contract; retain v1 for Hermes

**Decision**: Preserve `/api/v1/memory/*` and its Hermes behavior. Publish the
connection/grant and cross-agent changes only under `/api/v2/memory/*`, with
schemas in `packages/shared` and generated OpenAPI documentation.

**Rationale**: The existing v1 routes already power an installed external
adapter. A request whose recall scope can include owner-controlled grants is a
semantic API change, while the architecture requires a major version prefix for
public API changes. V2 remains client-neutral; neither its URLs nor persistent
objects name OpenClaw.

**Alternatives considered**:

- Change v1 in place: rejected because existing Hermes clients could receive
  changed discovery/recall semantics without opting in.
- Add OpenClaw routes beside v1: rejected because it would bake one adapter
  into the generic server and force later clients onto another path.

**Local evidence**: Current v1 routes are in
`apps/web/app/api/v1/memory/`; OpenAPI rules are in
`docs/architecture/mandates.md`.

## D2: Connection identity is distinct from a credential

**Decision**: Introduce a stable, owner-managed Agent Memory Connection with a
private destination. Associate credentials with that connection and evolve
existing key bindings through a repeatable compatibility/backfill service.

**Rationale**: The current binding's primary key is the API key, so rotation
changes the effective identity. A connection makes agent identity, destination,
history, grants, and pending capture attribution stable across credential
rotation without trusting OpenClaw hook fields.

**Alternatives considered**:

- Continue to use the API-key binding as connection identity: rejected because
  key rotation and agent recreation become new identities, and background
  capture cannot be safely attributed.
- Let the plugin supply an agent ID/path each call: rejected because it makes
  client data the authorization boundary.

**Local evidence**: `agent_memory_key_bindings` maps one API key to one
namespace in `apps/web/src/server/db/schema/agent-memory.ts`; access resolution
currently derives that namespace per request in
`apps/web/src/server/permissions/agent-memory.ts`.

## D3: Explicit grants are the cross-agent boundary

**Decision**: Keep a connection's private destination implicit, and model every
other read/write right as an owner-created active destination grant. V2 recall
accepts a closed `own`, `granted`, or `own_and_granted` intent, never a
destination ID or agent name.

**Rationale**: Current `sharedNamespaceId` reuses a destination for a new key
but cannot distinguish read sharing from write sharing. Server-expanded grants
make cross-agent reads possible while preserving non-disclosure and make shared
write a separate intentional owner action.

**Alternatives considered**:

- Query by an `agents[]` or `destinationIds` filter: rejected because callers
  could probe destination existence and authorization would be path-based.
- One common namespace for every agent: rejected because it removes private
  defaults and makes revocation unbounded.

**Local evidence**: Existing recall filters by both namespace and
`agentIdentity`; no grant entity exists. See
`apps/web/src/server/services/agent-memory.ts` and `services/api-keys.ts`.

## D4: Raw revisions are canonical; asynchronous input is encrypted and transient

**Decision**: Continue writing canonical records through the restricted Raw
writer. Store asynchronous capture input in an encrypted, TTL-bound ingest
envelope; enqueue only a capture ID, delete the envelope after durable Raw
write, and never expose it to recall/audit/public surfaces.

**Rationale**: Capture may exceed the request budget, but raw message bodies in
pg-boss job data create an uncontrolled transient copy. Existing AES-GCM helper
and encrypted action-payload patterns provide a project-native protection
mechanism while the Raw page/revision remains the only durable source body.

**Alternatives considered**:

- Keep raw messages in the job payload: rejected because queue inspection,
  retries, and retention make sensitive content harder to control.
- Write the Raw page synchronously: rejected because it violates the
  asynchronous-heavy-operation mandate and delays a bridge's capture path.
- Add an unencrypted transcript table: rejected because it becomes a second,
  less-governed source of truth.

**Local evidence**: `submitEvidenceCapture` currently queues messages;
`apps/web/src/server/crypto/key-encryption.ts` and encrypted AI payloads show
the supported encrypted-at-rest pattern.

## D5: OpenClaw is a non-capability companion bridge

**Decision**: Publish the continuous adapter as a native ESM non-capability
plugin with hooks, optional tools, and a plugin-owned service. It will not take
`plugins.slots.memory`, register an exclusive memory provider, or call another
memory plugin's private API.

**Rationale**: OpenClaw supports non-capability plugins and requires published
packages to declare manifest ownership. The memory slot is exclusive, whereas
the bridge must coexist with local `memory_search` and preserve its fast local
working-memory behavior.

**Alternatives considered**:

- Replace the memory slot: rejected because it disables or competes with local
  memory and makes next-wiki an OpenClaw-specific service dependency.
- Implement an operator `HOOK.md`: rejected because the integration needs
  typed lifecycle semantics, manifest-owned tools, service lifecycle, and
  package distribution.

**Sources**: [OpenClaw plugin architecture](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/architecture.md), [Building plugins](https://docs.openclaw.ai/plugins/building-plugins), [Memory Wiki](https://docs.openclaw.ai/plugins/memory-wiki).

## D6: Hooks enqueue; they never prove durability or veto compaction

**Decision**: Persist a deterministic capture request to the bridge outbox at
supported compaction/session/turn boundaries, then deliver asynchronously.
Use Gateway start to recover the outbox and Gateway stop only for an abortable,
bounded best-effort flush. Treat `before_compaction` and `after_compaction` as
observe-only and defer an enforced strict checkpoint to a future supported host
capability.

**Rationale**: OpenClaw documents compaction hooks as observe-only and notes
that observation hooks can overlap. Session shutdown has a shared two-second
drain and Gateway stop a short timeout, so remote I/O in those handlers can be
interrupted. A durable local queue plus server idempotency is the correct
at-least-once boundary.

**Alternatives considered**:

- Post to next-wiki directly inside every hook: rejected because an outage
  delays or loses lifecycle work and hook timeout does not cancel I/O.
- Claim successful pre-compaction preservation after callback execution:
  rejected because the current OpenClaw contract provides no veto/durable
  acknowledgement mechanism.

**Sources**: [OpenClaw plugin hooks](https://docs.openclaw.ai/plugins/hooks).

## D7: External package uses a portable private outbox

**Decision**: The bridge service owns a bounded durable outbox under the
OpenClaw state directory resolved by the public runtime helper. It uses atomic
files, Gateway-user-only permissions, payload/age/count caps, retry with
jitter, dead-letter diagnostics, and no body logging.

**Rationale**: OpenClaw's durable runtime stores/queues are restricted to
bundled or trusted-official plugins; an independently published ClawHub package
cannot depend on them. The local outbox retains only not-yet-acknowledged
capture payloads and documents the host filesystem trust boundary.

**Alternatives considered**:

- Use an in-memory queue: rejected because a restart loses unacknowledged
  captures.
- Use privileged OpenClaw queue/state APIs: rejected because they are not
  portable to third-party installations.
- Add a second server queue service: rejected by the default-deployment
  constraint.

**Sources**: [OpenClaw SDK runtime](https://docs.openclaw.ai/plugins/sdk-runtime), [OpenClaw plugin hooks](https://docs.openclaw.ai/plugins/hooks).

## D8: Tool authority gates optional prompt enrichment

**Decision**: Register uniquely named external-memory tools as optional and
declare them in the manifest. Prompt enrichment runs only in the authorized
second `before_prompt_build` phase after the tool authority permits
`next_wiki_memory_search`; it returns bounded, escaped, cited context and fails
open. Save and forget require an additional per-call plugin approval; server
authorization remains final.

**Rationale**: Optional tools prevent model exposure before operator opt-in.
The post-policy hook has an ephemeral authority that OpenClaw rechecks after
awaited work, which prevents external recall from bypassing an agent's final
tool policy. A local approval makes model-triggered persistence intentional but
cannot replace server ACL.

**Alternatives considered**:

- Call local `memory_search` from the plugin: rejected because it is a
  model-facing tool, not a plugin API, and would collapse separate local and
  external memory layers.
- Use ordinary prompt build before policy finalization: rejected because it
  could retrieve context for a tool surface the turn cannot use.
- Enable all bridge tools by default: rejected because it exposes side effects
  and sensitive retrieval before operator review.

**Sources**: [OpenClaw plugin hooks](https://docs.openclaw.ai/plugins/hooks), [Tool plugins](https://docs.openclaw.ai/plugins/tool-plugins), [Plugin permission requests](https://docs.openclaw.ai/plugins/plugin-permission-requests).

## D9: One-time migration is separate from the bridge

**Decision**: Deliver a separately published OpenClaw migration-provider
package with preview, explicit approval, a resumable local fingerprint ledger,
and generic v2 import provenance. It will not run continuously or remove local
memory/session source files.

**Rationale**: Historical import has a wider privacy scope and different retry
semantics from routine lifecycle capture. A separate package lets operators
review it independently and keeps the production bridge small.

**Alternatives considered**:

- Add import scanning to Gateway startup: rejected because it silently expands
  capture scope and may import history without review.
- Use a shell script: rejected because it lacks OpenClaw-native discovery,
  packaged compatibility, preview, and resumable state.

**Sources**: [OpenClaw plugin architecture](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/plugins/architecture.md), [Mino Externalized Memory Architecture](https://kb.hugogu.cn/wiki/reflections/meta/2026-08-27-mino-externalized-memory-architecture).

## D10: Public guides require targeted invalidation

**Decision**: Convert the existing Hermes-specific Agent Memory guide into a
generic guide and add `help/openclaw-memory-bridge`. Introduce targeted public
page and navigation cache tags for managed-guide updates; do not invalidate on
collision, skip, or failure.

**Rationale**: Existing first-run pages already use normal published revisions
and collision protection, but their broad public cache tag cannot prove the
specification's targeted invalidation outcome. Adding scoped tags preserves
static/ISR delivery while narrowing only this mutation path.

**Alternatives considered**:

- Replace `help/agent-memory` with OpenClaw-only instructions: rejected because
  the server supports Hermes and future adapters too.
- Add a dynamic integration dashboard to the public page: rejected because it
  would mix credentials and user state into static public content.
- Reuse the global public cache tag: rejected because it invalidates unrelated
  published pages.

**Local evidence**: `setup-sample-page-definitions.ts`,
`setup-sample-pages.ts`, and `PUBLIC_CONTENT_CACHE_TAG` usage in
`apps/web/src/server/cache/public-cache.ts`.

## D11: Publish only built, tested package artifacts

**Decision**: Build each package to JavaScript, pack it, install it using
OpenClaw's managed package path, inspect the active runtime, and test the
recorded minimum and current OpenClaw versions before a ClawHub release.

**Rationale**: Source-checkout tests can hide missing runtime dependencies or
manifest/runtime mismatch. OpenClaw uses manifest contracts during discovery,
and compatibility fields must start at the first API used by the bridge.

**Alternatives considered**:

- Publish TypeScript source entries: rejected because external package runtime
  entries must point at built JavaScript.
- Validate only mocked plugin API calls: rejected because loader/package
  failures are an important part of the user installation path.

**Sources**: [Building plugins](https://docs.openclaw.ai/plugins/building-plugins), [OpenClaw plugin manifest](https://docs.openclaw.ai/plugins/manifest).
