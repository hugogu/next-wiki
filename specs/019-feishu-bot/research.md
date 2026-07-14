# Research: Feishu Bot Integration

## R1 — Inbound event transport, authenticity, and replay handling

**Decision**: Serve the Feishu Event v2 callback as a Next.js route handler in
the web app (`POST /webhooks/feishu/events`). Require the configured Encrypt Key
and official SDK/protocol signature validation before parsing or enqueuing a
business event. Handle URL verification separately and immediately. Persist an
inbox/deduplication record before asynchronous processing: use `message_id` for
`im.message.receive_v1` and `event_id` for other v2 events, namespaced by tenant
and event type. Retain the deduplication record for at least 24 hours and
acknowledge a duplicate as a successful no-op.

**Rationale**: Feishu documents at-least-once event delivery and retries through
six hours; a Verification Token alone is not sufficient event authentication. A
durable inbox prevents repeat binding, repeated LLM work, and duplicate cards
across web-app restarts while keeping webhook acknowledgement short. Serving the
callback in the web app removes the separate listener process entirely — the
route handler already has direct, in-process access to the binding, permission,
and job services it needs, so no inter-process contract is required.

**Alternatives considered**:

- Separate long-running bot process with a private HTTP delegation contract —
  rejected. It adds a second image/process, an inter-process trust boundary, and
  a shared service credential for no functional gain now that the callback can
  be an in-process route. Collapsing it into the web app is simpler (P1/KISS).
- Verification Token only — rejected because it may be sent in cleartext and does
  not protect the inbound business request sufficiently.
- Feishu long-connection (WebSocket) transport — rejected for v1 because it
  couples a long-lived socket lifecycle to every web replica; a stateless signed
  webhook fits Next.js route handling and horizontal scaling better.
- In-memory deduplication — rejected because restarts and multiple web replicas
  reintroduce duplicate processing.

**Sources**:

- [Feishu Encrypt Key configuration](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/encrypt-key-encryption-configuration-case?lang=zh-CN)
- [Feishu event retries and event IDs](https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM?lang=zh-CN)
- [Feishu message receive event](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)

## R2 — Permission-safe group behavior

**Decision**: Support two explicit group subscription modes:

- `public_safe`: post a group card only when the event resource remains publicly
  readable at delivery time. A page title/path/link is rendered only after that
  check.
- `private_recipients`: use the group solely to select potential recipients;
  enumerate current members when the operator has granted the required Feishu
  scope, map active bindings, re-check wiki permission per recipient, and send
  protected details only through direct messages. Never post a protected summary,
  title, URL, count, or failure explanation to the group.

AI-action completion is a direct notification to the action actor's active
binding. Group questions use only the @-mention sender's binding; the response is
direct when it would disclose page content.

**Rationale**: Bot membership or the ability to post in a chat does not establish
that every chat member may read a Wiki resource. This preserves group
subscriptions without creating an alternate, weaker authorization model.

**Alternatives considered**:

- Broadcast every configured event to the group — rejected because titles, links,
  action outcomes, and transfer state are protected metadata.
- Require every group member to bind and grant access before every group card —
  rejected as an unnecessary advanced Feishu permission for public notifications;
  private delivery instead fans out only to eligible bound recipients.
- Drop group subscriptions — rejected because it removes requested functionality.

**Sources**:

- [Feishu send-message requirements and limits](https://open.feishu.cn/document/server-docs/im-v1/message/create)
- [Feishu application scopes](https://open.feishu.cn/document/server-docs/application-scope/scope-list)

## R3 — In-process delegation (bound-user attribution)

**Decision**: Resolve delegation entirely in-process. The webhook route hands a
validated, deduplicated command to a Feishu delegation service in the same
process. That service looks up the active binding for the Feishu `open_id`,
builds the bound user's normal `PermCtx` with `buildUserCtx`, calls the existing
`createWikiQuestion(ctx, input)` service, tags the action with Feishu request
metadata, and records `origin=feishu`. There is no service credential, no
caller-supplied user id, and no HTTP hop — the effective user is derived only
from the confirmed binding.

**Rationale**: `createWikiQuestion(ctx, input)` and the existing worker already
preserve `actorUserId`, re-check the active user and AI entitlement, and retrieve
under a normal permission context. Calling them directly from the same process
reuses those correct paths without introducing a second process, a private HTTP
API, or an impersonation token that would turn a compromise into arbitrary user
impersonation.

**Alternatives considered**:

- Private service-to-service HTTP contract with a bot service token — rejected as
  unnecessary indirection now that the caller is in-process; it added a
  credential to manage and an internal API surface to secure.
- Store a Wiki API key per Feishu binding — rejected for secret proliferation,
  revocation complexity, and actor ambiguity.
- Generic service token plus caller-supplied `userId` — rejected because it turns
  a token compromise into arbitrary user impersonation.

**Local evidence**:

- `apps/web/app/api/ai/questions/route.ts`
- `apps/web/src/server/services/ai-question.ts`
- `apps/web/src/server/jobs/ai-question.ts`
- `apps/web/src/server/permissions/index.ts`

## R4 — Durable notification and answer delivery

**Decision**: Use PostgreSQL notification-event and delivery rows as the source
of truth, with the existing pg-boss infrastructure waking/scheduling in-process
workers registered through `registerJobs`. Create the event/outbox row
transactionally with the business transition where possible. A delivery worker
claims due rows, re-checks the binding, subscription, and authorization
immediately before rendering, sends one message through the in-process Feishu
transport, and atomically records the outcome. Grounded Q&A answers reuse the
same outbox: when a `wiki_question` action completes, a delivery row targeting
the asker's binding is created and sent by the same worker. Delivery is
at-least-once, with a unique `(event_id, subscription_id, recipient)` key,
deterministic outgoing request UUID (the delivery id), exponential backoff from
15 seconds to 5 minutes, five attempts, and stale-claim recovery on boot.
Records expire after the configured retention window (72 hours default, 24–168
configurable) with an explicit `expired` status.

**Rationale**: the pg-boss facade may safely no-op when workers are unavailable;
it cannot be the durable notification source. Existing storage-replication rows
already demonstrate the required persistent status/attempt/availability/unique
pattern, and `registerJobs` already boots stale-work recovery for other
features — the Feishu workers slot into that same seam.

**Alternatives considered**:

- pg-boss only — rejected because an unavailable queue can lose the wake-up and
  there is no administrator-visible delivery lifecycle.
- Exactly-once external delivery — rejected because a network failure after Feishu
  accepts a send cannot be distinguished from a failed send. At-least-once plus
  deterministic idempotency is the reliable bounded guarantee.
- A separate delivery poller process — rejected; the existing in-process job
  runner already provides scheduling, batching, and boot recovery.

**Local evidence**:

- `apps/web/src/server/jobs/runtime.ts`
- `apps/web/src/server/jobs/register.ts`
- `apps/web/src/server/db/schema/index.ts` (`storageReplicationTasks`)
- `apps/web/src/server/services/git-export.ts`

## R5 — Secrets, audit provenance, and retention

**Decision**: Encrypt the Feishu app secret and Encrypt Key with the existing
AES-256-GCM key-encryption primitive. Configuration input is write-only and
output exposes only `hasSecret` / masked identity. The web app decrypts these
in-process when verifying inbound events and sending messages. Extend audit
entries with a bounded origin and an external correlation identifier; use
`feishu` plus a non-secret event/message correlation value. Do not put raw
questions, answers, credentials, or Feishu IDs in the audit metadata. Expire bot
sessions immediately on unbind/revocation and retain delivery/session records
only through their documented TTLs.

**Rationale**: current encrypted storage configurations and AI-action retention
already establish patterns that meet this feature's needs. The current audit
schema lacks a queryable source/channel and therefore cannot satisfy FR-018/FR-027
without extension. Keeping credentials in the encrypted DB config (not process
env) means the admin UI remains the single source of truth and the same in-process
code both stores and consumes them.

**Alternatives considered**:

- Plaintext app secret with a masked UI — rejected because masking does not protect
  the database, backups, or logs.
- Credentials in process environment variables — rejected because it splits the
  source of truth from the admin-managed encrypted config and complicates rotation.
- Encode `feishu` in an audit path or entry type — rejected because origin remains
  ambiguous and unqueryable.

**Local evidence**:

- `apps/web/src/server/crypto/key-encryption.ts`
- `apps/web/src/server/services/audit.ts`
- `apps/web/src/server/db/schema/index.ts` (`apiAuditEntries`, `aiActions`)

## R6 — Deployment and rate limiting

**Decision**: Ship the integration inside the existing `web` service. The Feishu
SDK is a web-app dependency; the webhook is a route handler; workers run on the
existing job runner. The only new external surface is the signed callback route,
exposed through the operator's existing HTTPS ingress/reverse proxy. Default
startup is unchanged and needs no Feishu credentials — the module is inert until
configured. Start with Wiki-protective in-process defaults of 10 accepted Q&A
requests per bound user per minute and 30 per chat per minute, while the outbound
sender also enforces Feishu's 5 QPS per-recipient and per-group constraints.

**Rationale**: this is the strongest possible fit for Constitution P1: no new
container, Compose profile, port, process, or stateful service. PostgreSQL plus
pg-boss already provide the durable-state and scheduling primitives. The
conservative Q&A limits protect the LLM/action queue independently of Feishu's
message-send limits.

**Alternatives considered**:

- Separate `feishu` Compose profile / bot container — rejected; it grew the
  deployment footprint and added an inter-process boundary the in-process module
  makes unnecessary.
- Run the bot in Next instrumentation as a long-lived socket — rejected because it
  couples transport lifecycle to web replicas; a stateless signed webhook plus
  DB-backed workers is simpler and horizontally safe.
- Add Redis or a broker — rejected because PostgreSQL plus pg-boss already meet
  the durable-state requirement and P1 prohibits a new default stateful service.

## R7 — QR app association and creation

**Decision**: Offer an administrator-initiated Feishu device-code registration
flow from `/admin/feishu`, modelled on OpenClaw's Feishu plugin. The web app
calls `https://accounts.feishu.cn/oauth/v1/app/registration` to initialize and
begin a `PersonalAgent` / `client_secret` flow, renders the returned
`verification_uri_complete` as a QR code, and polls once per browser-scheduled
interval. The browser receives no device code. A short-lived PostgreSQL row
holds only AES-256-GCM-encrypted `device_code`; on completion the server writes
the returned App ID and App Secret through the existing write-only encrypted
configuration service. Manual credentials remain the fallback.

**Rationale**: this produces the same native Feishu experience as OpenClaw:
the mobile app presents the administrator with the choice to associate an
existing app or create a new one. Persisting the short-lived encrypted state
survives a web-app restart and keeps the device credential out of the browser,
without a second process, worker, or container. Event v2 still needs its
Encrypt Key and optional Verification Token configured before the integration
can be enabled, so this flow cannot safely enable the webhook automatically.

**Alternatives considered**:

- Claim that the QR flow can create a bot without a server-side device-code
  exchange — rejected because the resulting App Secret must not be exposed to
  the client.
- Store the device code in an HTTP-only cookie or process memory — rejected
  because it is fragile across restarts and cannot be safely recovered on a
  multi-replica deployment.
- Use a third-party QR image endpoint — rejected because it unnecessarily
  discloses the verification URL; render locally instead.

**Local evidence**:

- `../openclaw/extensions/feishu/src/app-registration.ts`
- `../openclaw/extensions/feishu/src/setup-surface.ts`
- `../openclaw/docs/channels/feishu.md`
