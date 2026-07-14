# Feishu Long-Connection Contract

The web application receives Feishu Event V2 messages through the official
Feishu SDK's outbound WebSocket long connection. There is no HTTP callback
route, callback URL, public ingress requirement, Encrypt Key, or Verification
Token configuration.

## Connection lifecycle

1. The administrator starts the QR association flow from `/admin/feishu`.
2. The server holds the device code only as short-lived encrypted state.
3. After Feishu returns an App ID and App Secret, the server stores the secret
   encrypted, enables the integration, and starts the SDK connection.
4. Application instrumentation also starts the connection after database and
   job-runner startup, so a restart reconnects an already-associated bot.
5. Ready, reconnecting, reconnected, and error callbacks update the masked
   connection-health record. No raw event or secret is recorded.

Only the QR association flow creates or updates application credentials. The
administrator UI has no manual credential or callback configuration form.

## Inbound event handling

The dispatcher subscribes to `im.message.receive_v1`. It normalizes the SDK
payload into the internal inbound-event shape and passes it to the same durable
inbox/delegation pipeline used by the delivery module.

1. Normalize event type, tenant key, event/message ID, sender, chat, text, and
   @-mention status.
2. Persist the inbox/de-duplication record before any binding or AI action.
3. Treat a duplicate as a successful no-op.
4. Resolve the Feishu binding and invoke in-process delegation.
5. Send only the safe disposition through the in-process Feishu transport; Q&A
   and notification delivery remain durable background work.

The implementation still applies the documented at-least-once delivery and
deduplication guarantees. It does not expose an HTTP endpoint and is therefore
absent from generated OpenAPI.
