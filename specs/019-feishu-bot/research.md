# Research: Feishu Bot Integration

## R1 — Inbound event transport, authenticity, and replay handling

**Decision**: Use Feishu Event v2 webhook delivery at the bot process. Require the
configured Encrypt Key and official SDK/protocol signature validation before parsing
or enqueuing a business event. Handle URL verification separately and immediately.
Persist an inbox/deduplication record before asynchronous processing: use
`message_id` for `im.message.receive_v1` and `event_id` for other v2 events,
namespaced by tenant and event type. Retain the deduplication record for at least
24 hours and acknowledge a duplicate as a successful no-op.

**Rationale**: Feishu documents at-least-once event delivery and retries through
six hours; a Verification Token alone is not sufficient event authentication. A
durable inbox prevents repeat binding, repeated LLM work, and duplicate cards
across bot restarts while preserving quick webhook acknowledgement.

**Alternatives considered**:

- Verification Token only — rejected because it may be sent in cleartext and does
  not protect the inbound business request sufficiently.
- Long connection — rejected for v1 because it couples a long-lived listener to
  the web process and conflicts with the specified separate bot role.
- In-memory deduplication — rejected because restarts and multiple bot replicas
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
that every chat member may read a Wiki resource. This preserves group subscriptions
without creating an alternate, weaker authorization model.

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

## R3 — Delegated bot-to-wiki calls

**Decision**: Add narrow, Feishu-specific private HTTP operations in the web app.
The bot authenticates as a service but sends only Feishu-derived identifiers. The
web app resolves the active binding server-side, builds the bound user's normal
permission context, calls the existing AI-question service, and records
`origin=feishu`. The bot must never supply a wiki user ID or use an end-user/API
key as the effective user.

**Rationale**: `POST /api/ai/questions` currently derives its actor from a browser
session/API context, while `createWikiQuestion(ctx, input)` and the existing worker
already preserve `actorUserId`, re-check the active user and AI entitlement, and
retrieve under a normal permission context. A narrow boundary reuses those correct
paths without granting a compromised bot arbitrary impersonation.

**Alternatives considered**:

- Store a Wiki API key per Feishu binding — rejected for secret proliferation,
  revocation complexity, and actor ambiguity.
- Generic service token plus caller-supplied `userId` — rejected because it turns
  a service-token compromise into arbitrary user impersonation.
- Import web server services into the bot — rejected because it breaks Approach A
  and bypasses the API/audit boundary.

**Local evidence**:

- `apps/web/app/api/ai/questions/route.ts`
- `apps/web/src/server/services/ai-question.ts`
- `apps/web/src/server/jobs/ai-question.ts`
- `apps/web/src/server/permissions/index.ts`

## R4 — Durable notification delivery

**Decision**: Use PostgreSQL notification-event and delivery rows as the source of
truth, with the existing pg-boss infrastructure only waking/scheduling workers.
Create the event/outbox row transactionally with the business transition where
possible. A bot worker claims due delivery rows, re-checks the binding,
subscription, and authorization immediately before rendering, then sends one card
and atomically records the outcome. Delivery is at-least-once, with a unique
`(event_id, subscription_id)` key, deterministic outgoing request UUID, exponential
backoff from 15 seconds to 5 minutes, five attempts, and a stale-claim recovery on
startup. Records expire after the configured retention window (72 hours default,
24–168 hours configurable) with explicit `expired` status.

**Rationale**: the local queue facade may safely no-op when workers are unavailable;
it cannot be the durable notification source. Existing storage replication rows
already demonstrate the required persistent status, attempt, availability, and
unique-delivery pattern.

**Alternatives considered**:

- pg-boss only — rejected because an unavailable queue can lose the wake-up and
  there is no administrator-visible delivery lifecycle.
- Exactly-once external delivery — rejected because a network failure after Feishu
  accepts a send cannot be distinguished from a failed send. At-least-once plus
  deterministic idempotency is the reliable bounded guarantee.
- In-memory reconnect queue — rejected because it loses work on restart.

**Local evidence**:

- `apps/web/src/server/jobs/runtime.ts`
- `apps/web/src/server/db/schema/index.ts` (`storageReplicationTasks`)
- `apps/web/src/server/services/git-export.ts`
- `apps/web/src/server/jobs/register.ts`

## R5 — Secrets, audit provenance, and retention

**Decision**: Encrypt the Feishu app secret with the existing AES-256-GCM key
encryption primitive. Configuration input is write-only and output exposes only
`hasSecret` / masked identity. Extend audit entries with a bounded origin and an
external correlation identifier; use `feishu` plus a non-secret event/message
correlation value. Do not put raw questions, answers, credentials, or Feishu IDs in
the audit metadata. Expire bot sessions immediately on unbind/revocation and
retain delivery/session records only through their documented TTLs.

**Rationale**: current encrypted storage configurations and AI-action retention
already establish patterns that meet this feature's security and operational needs.
The current audit schema lacks a queryable source/channel and therefore cannot
satisfy FR-018 without extension.

**Alternatives considered**:

- Plaintext app secret with a masked UI — rejected because masking does not protect
  the database, backups, or logs.
- Encode `feishu` in an audit path or entry type — rejected because origin remains
  ambiguous and unqueryable.

**Local evidence**:

- `apps/web/src/server/crypto/key-encryption.ts`
- `apps/web/src/server/services/audit.ts`
- `apps/web/src/server/db/schema/index.ts` (`apiAuditEntries`, `aiActions`)

## R6 — Deployment and rate limiting

**Decision**: Provide an optional `feishu` Compose profile with a stateless `bot`
service built from the same repository image as `web`; it exposes only the HTTPS
webhook port required by Feishu (or is routed through an operator-managed ingress),
uses PostgreSQL for all durable state, and reaches the web service on the Compose
network. Default startup remains unchanged without Feishu credentials. Start with
Wiki-protective defaults of 10 accepted Q&A requests per bound user per minute and
30 per chat per minute, while the outbound sender also enforces Feishu's 5 QPS
per-recipient and per-group constraints.

**Rationale**: this preserves Approach A and Constitution P1: a separate process
without a new stateful service, mandatory external dependency, or changed default
deployment. The conservative Q&A limits protect the LLM/action queue independently
of Feishu's message-send limits.

**Alternatives considered**:

- Run the bot in Next instrumentation — rejected because it couples long-lived
  transport lifecycle to web replicas and violates the separate-process decision.
- Add Redis or a broker — rejected because PostgreSQL plus pg-boss already meets
  the durable-state requirement and P1 prohibits a new default stateful service.
