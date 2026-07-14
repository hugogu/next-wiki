# Feishu Event Webhook Contract

This callback is implemented by the optional `apps/feishu-bot` process. It is the
only externally reachable integration endpoint. It returns no Wiki content and is
not an anonymous Wiki REST API.

## Endpoint

`POST /webhooks/feishu/events`

The operator registers an HTTPS URL for this endpoint in the Feishu Developer
Console. In Compose, expose only this port when the optional `feishu` profile is
enabled, or route it from an operator-managed HTTPS reverse proxy/ingress.

## Request handling

1. Accept only Feishu Event v2 envelopes.
2. Handle the Feishu URL-verification challenge immediately and without enqueuing a
   business operation.
3. Decrypt/verify every business request using the configured Encrypt Key and the
   official Feishu SDK/protocol. A Verification Token is a configuration check, not
   the sole authenticity control.
4. Reject malformed, invalid, or stale requests before reading business fields.
5. Derive the durable deduplication key from tenant + event type + Feishu
   `message_id` for message receive events, otherwise Feishu `event_id`.
6. Persist the inbox record before handing a sanitized command to the private
   bot-to-wiki contract. A duplicate receives a successful no-op acknowledgement.
7. Return an acknowledgement within the Feishu webhook budget; bot-to-wiki Q&A and
   all sends remain asynchronous.

## Accepted v1 event scope

- `im.message.receive_v1` from direct messages and group @-mentions.
- Only supported event types configured by the operator are accepted. Unrecognized
  or unscoped events are acknowledged/ignored without Wiki side effects.

## Response behavior

- URL verification: the protocol-required challenge response only.
- Valid accepted or duplicate event: HTTP 2xx acknowledgement without Wiki data.
- Invalid authenticity/freshness: a generic 4xx response with no information about
  bindings, resources, or configuration.
- Internal bot/wiki failure after durable acceptance: HTTP 2xx if the event has
  safely reached the inbox; recovery processes the durable record rather than
  relying on Feishu retry timing.

## Security and observability

- Do not log raw encrypted envelopes, app secrets, raw questions, or authorization
  headers.
- Log/trace only the opaque correlation ID and normalized event type/outcome.
- The bot service credential is used only for the private internal contract; it is
  never accepted at this public callback as a substitute for Feishu verification.
