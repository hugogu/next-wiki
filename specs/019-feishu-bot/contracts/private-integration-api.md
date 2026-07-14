# Private Feishu Integration Contract

This is a private HTTP+JSON contract between `apps/feishu-bot` and `apps/web` on
the Compose network. It is not anonymously reachable, is not part of the public
REST/OpenAPI surface, and is documented here so its behavior remains explicit and
testable. Every request requires the bot service credential; the web app resolves
the effective Wiki user itself.

## Common rules

- Validate input and output with shared Zod schemas.
- Authenticate the bot service before parsing an operation body; reject a missing,
  expired, or incorrect credential with `401` and no binding/resource disclosure.
- The request never accepts `user_id`, role, permission scope, or a caller-chosen
  audit origin.
- `feishu_open_id`, `chat_id`, `message_id`, and `event_id` are source identifiers,
  not Wiki authorization. The web app resolves an active binding and builds the
  normal user `PermCtx`.
- Each logical request carries `correlation_id`. It must be a UUID or opaque bounded
  value, never a raw question, secret, or rendered answer.
- Error responses use `{ "code": string, "message": string }`; errors never reveal
  unreadable resource existence or another user's binding state.

## `POST /api/internal/feishu/inbound-messages`

Accept a validated, deduplicated Feishu direct message or group @-mention and
return a disposition for the bot transport.

### Request

```json
{
  "event_key": "tenant:event_type:message_id",
  "message_id": "om_xxx",
  "open_id": "ou_xxx",
  "chat_id": "oc_xxx",
  "chat_type": "p2p",
  "mentioned_bot": false,
  "text": "How do I reset a key?",
  "correlation_id": "a4d5f64a-54b8-4b43-a2a7-fd0c22e56134"
}
```

### Success responses

Unbound user:

```json
{
  "disposition": "bind",
  "bind_url": "https://wiki.example.com/integrations/feishu/bind?token=opaque",
  "correlation_id": "a4d5f64a-54b8-4b43-a2a7-fd0c22e56134"
}
```

Bound user, accepted async Q&A:

```json
{
  "disposition": "question_queued",
  "ai_action_id": "9fe1a8e5-7a18-4cf6-bc3a-406a1e81312f",
  "response_target": { "type": "direct", "open_id": "ou_xxx" },
  "correlation_id": "a4d5f64a-54b8-4b43-a2a7-fd0c22e56134"
}
```

Non-mention group message or duplicate:

```json
{ "disposition": "ignored", "correlation_id": "a4d5f64a-54b8-4b43-a2a7-fd0c22e56134" }
```

### Behavior

- A group request requires `mentioned_bot = true`.
- The web app consumes `event_key` idempotently. A duplicate returns the original
  safe disposition or `ignored`; it never creates another binding token/action.
- A successful queue operation records `actor_user_id` as the resolved binding's
  user and `origin=feishu`; it reuses the normal AI entitlement and permission
  services.
- The result target is direct for any answer that could disclose Wiki content.

## `GET /api/internal/feishu/ai-actions/{action_id}`

Return only the requesting bot's Feishu-origin action state. The web app checks the
origin/correlation and binding ownership rather than trusting the supplied ID.

### Successful response

```json
{
  "status": "completed",
  "result": {
    "kind": "answer",
    "text": "Use the API key settings page...",
    "citations": [
      { "title": "API Keys", "url": "https://wiki.example.com/settings/api-keys" }
    ]
  },
  "correlation_id": "a4d5f64a-54b8-4b43-a2a7-fd0c22e56134"
}
```

`queued` and `running` return no partial private source data. Insufficient evidence,
AI-disabled, revoked binding, disabled user, or lost entitlement return a safe status
that the bot maps to a direct user-facing explanation.

## `POST /api/internal/feishu/delivery-claims`

Claim a bounded batch of due delivery rows for the authenticated bot. The web app
atomically changes only `queued`/`retry` rows whose `available_at` is due and whose
lease is not owned by a live claim. It creates one response item per target recipient.

### Request

```json
{ "limit": 20, "worker_id": "bot-1" }
```

### Response

```json
{
  "claims": [
    {
      "delivery_id": "c4249a44-22ad-48b3-8868-bd254599bc4c",
      "request_uuid": "c4249a44-22ad-48b3-8868-bd254599bc4c",
      "target": { "type": "direct", "open_id": "ou_xxx" },
      "card": { "schema": "sanitized-feishu-card-v1", "body": {} },
      "lease_expires_at": "2026-07-14T10:31:00Z"
    }
  ]
}
```

The web app re-checks binding, subscription, resource visibility, and recipient
permission immediately before a claim is rendered. A blocked/expired delivery is
not returned as a claim and becomes an administrator-visible terminal record.

## `POST /api/internal/feishu/delivery-claims/{delivery_id}/outcomes`

Complete a claimed delivery.

### Request

```json
{
  "request_uuid": "c4249a44-22ad-48b3-8868-bd254599bc4c",
  "outcome": "delivered",
  "provider_message_id": "om_xxx"
}
```

`outcome` is `delivered`, `retryable_failure`, or `permanent_failure`. The web app
accepts an outcome only from the current lease holder and with the same request UUID.
Retryable failure schedules exponential backoff (15 seconds to 5 minutes); the fifth
failed attempt pauses/surfaces the subscription. A stale lease is recovered by the
worker registration/recovery routine. Duplicate outcome submissions are idempotent.

## Event and configuration boundaries

The web app creates notification event/outbox records from page publish, AI-action
completion, and transfer completion services; the bot does not create arbitrary Wiki
events. Admin configuration, binding confirmation, revocation, health, and
subscription management remain authenticated first-party admin/UI operations backed
by the same service layer. Their route schemas must preserve browser-native URLs and
the standard API audit behavior.
