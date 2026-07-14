# Feishu Event Webhook Contract

This callback is a Next.js route handler in the web app
(`apps/web/app/webhooks/feishu/events/route.ts`). It is the only externally
reachable Feishu surface. It returns no Wiki content and is **not** part of the
public Wiki REST/OpenAPI surface.

## Endpoint

`POST /webhooks/feishu/events`

The operator registers this HTTPS URL in the Feishu Developer Console. It is
served by the web app and exposed through the operator's existing ingress /
reverse proxy — no dedicated port or process. It lives under `/webhooks` (not
`/api`) so it is never mistaken for, or documented as, a public API resource.

## Request handling

1. Accept only Feishu Event v2 envelopes.
2. Handle the Feishu URL-verification challenge immediately and without enqueuing
   a business operation.
3. Decrypt/verify every business request using the configured Encrypt Key and the
   official Feishu SDK/protocol. A Verification Token is a configuration check,
   not the sole authenticity control.
4. Reject malformed, invalid, or stale requests before reading business fields.
5. Derive the durable deduplication key from tenant + event type + Feishu
   `message_id` for message receive events, otherwise Feishu `event_id`.
6. Persist the inbox record, then hand a sanitized command to the in-process
   Feishu delegation service. A duplicate receives a successful no-op
   acknowledgement.
7. Return an acknowledgement within the Feishu webhook budget; Q&A execution and
   all outbound sends remain asynchronous (existing AI action lifecycle and
   pg-boss delivery workers).

## Accepted v1 event scope

- `im.message.receive_v1` from direct messages and group @-mentions.
- Only supported event types configured by the operator are accepted.
  Unrecognized or unscoped events are acknowledged/ignored without Wiki side
  effects.

## Response behavior

- URL verification: the protocol-required challenge response only.
- Valid accepted or duplicate event: HTTP 2xx acknowledgement without Wiki data.
- Invalid authenticity/freshness: a generic 4xx response with no information about
  bindings, resources, or configuration.
- Internal failure after durable acceptance: HTTP 2xx once the event has safely
  reached the inbox; boot recovery and the delivery workers process the durable
  record rather than relying on Feishu retry timing.

## Security and observability

- Do not log raw encrypted envelopes, app secrets, raw questions, or Feishu
  identities.
- Log/trace only the opaque correlation ID and normalized event type/outcome.
- The Feishu app secret and Encrypt Key are read in-process from the encrypted
  configuration record; they are never present in process environment or logs.
