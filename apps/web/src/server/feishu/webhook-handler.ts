import type { FeishuInboundMessage } from '@next-wiki/shared';
import type { FeishuTransport } from './transport-types';
import { logger } from '@/server/logger';
import { recordInbound, markProcessed, markRejected, inboxKey } from '@/server/services/feishu-inbox';
import { handleInboundMessage } from '@/server/services/feishu-delegation';
import { actOnDisposition } from '@/server/services/feishu-messaging';

export type WebhookResult = {
  status: number;
  /** JSON body to return, or a short text acknowledgement. */
  body: unknown;
};

const ACK: WebhookResult = { status: 200, body: 'ok' };

/**
 * Verify → decrypt → deduplicate → delegate → send, returning the HTTP result
 * for the Feishu callback. Pure with respect to the transport so tests can
 * substitute a deterministic double. It never throws for business failures:
 * once an event is durably recorded, it acknowledges so Feishu stops retrying,
 * and processing failures are logged for recovery.
 */
export async function processWebhook(args: {
  transport: FeishuTransport;
  rawBody: string;
  headers: Record<string, string | undefined>;
}): Promise<WebhookResult> {
  const parsed = args.transport.parseWebhook(args.rawBody, args.headers);

  if (parsed.kind === 'invalid') {
    // Generic 4xx with no information about bindings, resources, or config.
    return { status: 400, body: 'bad request' };
  }
  if (parsed.kind === 'url_verification') {
    return { status: 200, body: { challenge: parsed.challenge } };
  }

  const event = parsed.event;
  // Only inbound message events are actionable in v1; ack + ignore the rest.
  if (event.eventType !== 'im.message.receive_v1' || !event.message) {
    return ACK;
  }
  const msg = event.message;
  const sourceEventId = msg.messageId || event.eventId;

  const record = await recordInbound({
    tenantKey: event.tenantKey,
    eventType: event.eventType,
    sourceEventId,
    openId: msg.openId,
    chatId: msg.chatId,
  });
  // A duplicate is a successful no-op (idempotent across retries/restarts).
  if (record.duplicate) return ACK;

  const input: FeishuInboundMessage = {
    eventKey: inboxKey(event.tenantKey, event.eventType, sourceEventId),
    messageId: msg.messageId,
    openId: msg.openId,
    chatId: msg.chatId,
    chatType: msg.chatType,
    mentionedBot: msg.mentionedBot,
    text: msg.text,
    correlationId: record.correlationId,
  };

  try {
    const disposition = await handleInboundMessage(input);
    await actOnDisposition(args.transport, input, disposition);
    await markProcessed(record.correlationId);
  } catch (error) {
    // The event is durably recorded; acknowledge so Feishu stops retrying and
    // let recovery/inspection handle the failure. Never leak details.
    await markRejected(record.correlationId).catch(() => {});
    logger.error('feishu webhook processing failed', {
      correlationId: record.correlationId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
  return ACK;
}
