# Feishu Integration Module Contract

The Feishu integration is an **in-process module** in the web app. There is no
bot process and no private service-to-service HTTP contract. This document
describes the module's internal boundaries (functions), the one external route
(the signed webhook, see [feishu-webhook.md](./feishu-webhook.md)), and the
first-party authenticated routes used by the admin UI and binding page.

## Module registration (P10)

A single `registerFeishuModule` seam wires the module:

- The webhook route (`app/webhooks/feishu/events/route.ts`) is registered by file
  convention and calls into the module.
- The delivery, recovery, and cleanup workers register on the existing pg-boss
  runner inside `registerJobs` (`src/server/jobs/register.ts`).
- No dynamic discovery; every handler and queue is named explicitly.

## In-process delegation boundary

The webhook route validates + deduplicates an inbound message, then calls the
delegation service **in the same process**. The service — not the caller —
resolves the effective Wiki user.

```ts
// src/server/services/feishu-delegation.ts
handleInboundMessage(input: FeishuInboundMessage): Promise<FeishuInboundDisposition>
```

Rules:

- The input carries only Feishu-derived identifiers (`open_id`, `chat_id`,
  `message_id`, `event_id`, text, `mentioned_bot`) and a bounded `correlation_id`.
  It never carries a Wiki `user_id`, role, permission scope, or audit origin.
- The service resolves the active binding for `open_id`. Unbound → `bind`
  disposition with a single-use link (direct chats only; never in a group).
- Bound → build the bound user's `PermCtx` via `buildUserCtx`, call
  `createWikiQuestion(ctx, input)`, tag Feishu request metadata, record
  `origin=feishu`, and return a `question_queued` disposition.
- A group message requires `mentioned_bot = true`; otherwise `ignored`.
- The `event_key` is consumed idempotently upstream (inbox row). A duplicate
  returns the original safe disposition or `ignored`; it never creates another
  binding token or action.
- Any answer that could disclose Wiki content is delivered direct, never to a
  group, unless every citation remains publicly readable at delivery time.

Dispositions (`packages/shared/src/feishu.ts`):

```jsonc
{ "disposition": "bind", "bindUrl": "https://wiki.example.com/user-center/feishu/bind?token=opaque", "correlationId": "…" }
{ "disposition": "question_queued", "aiActionId": "…", "responseTarget": { "type": "direct", "openId": "ou_…" }, "correlationId": "…" }
{ "disposition": "ignored", "correlationId": "…" }
```

## Answer + notification delivery

Delivery is durable and idempotent, driven by pg-boss workers (not an HTTP poll):

- When a `wiki_question` action reaches a terminal state, the module creates a
  delivery row targeting the asker's binding. The delivery worker re-checks the
  binding and each citation's visibility, renders a sanitized card, sends it via
  the in-process Feishu transport, and records the outcome.
- Notification events (page publish, AI-action completion, transfer completion)
  create minimal `feishu_notification_events` outbox rows transactionally with
  the source transition where possible; the delivery worker expands them into
  per-target deliveries after subscription + permission checks.
- `delivered` / `retryable_failure` / `permanent_failure` outcomes drive
  exponential backoff (15s→5m), five attempts, and subscription pause/surface on
  the fifth failure. The delivery id is the deterministic Feishu request UUID.
- Insufficient evidence, AI-disabled, revoked binding, disabled user, or lost
  entitlement map to a safe, direct, user-facing explanation — never leaked
  content.

## First-party authenticated routes

These are normal web app routes with session/permission checks, Zod validation,
and standard API-audit behavior. They are not the webhook and not public API.

- `POST /api/feishu/bindings` — the signed-in user confirms a pending binding
  token (matches `open_id`, single-use, 10-minute expiry) or unbinds.
- `GET/PUT /api/admin/feishu` — admin reads masked config / connection health and
  writes write-only credentials and bounded limits (`manage_ai`/admin only).
- `POST/GET/DELETE /api/admin/feishu/subscriptions` — admin manages notification
  subscriptions with mode/target invariants.
- `GET /api/admin/feishu/deliveries` — admin reviews delivery health.
- `GET/DELETE /api/admin/feishu/bindings` — admin filters and revokes bindings.

All admin routes preserve browser-native URLs (query-parameter filters/pagination)
and never return a plaintext secret.

## Configuration and event boundaries

The module creates notification event/outbox records only from page publish,
AI-action completion, and transfer completion services. Admin configuration,
binding confirmation, revocation, health, and subscription management are
authenticated first-party operations backed by the same service layer. The
Feishu app secret and Encrypt Key live only as AES-256-GCM ciphertext in the
singleton configuration record and are decrypted in-process at use time.
