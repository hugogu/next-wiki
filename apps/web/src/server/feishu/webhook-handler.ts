import type { FeishuInboundMessage } from '@next-wiki/shared';
import type { FeishuTransport } from './transport-types';
import { logger } from '@/server/logger';
import {
  recordInbound,
  markProcessed,
  markRejected,
  inboxKey,
} from '@/server/services/feishu-inbox';
import { handleInboundMessage } from '@/server/services/feishu-delegation';
import { actOnDisposition } from '@/server/services/feishu-messaging';

export type InboundEventResult = {
  status: number;
  /** JSON body to return, or a short text acknowledgement. */
  body: unknown;
};

const ACK: InboundEventResult = { status: 200, body: 'ok' };

/** Process one normalized event from any Feishu ingress transport. */
export async function processInboundEvent(args: {
  transport: FeishuTransport;
  event: import('./transport-types').InboundFeishuEvent;
}): Promise<InboundEventResult> {
  const event = args.event;
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
    const disposition = await handleInboundMessage(input, {
      start: async (messageId) => {
        try {
          return await args.transport.addProcessingReaction(messageId);
        } catch (error) {
          logger.warn('feishu processing reaction could not be added', {
            correlationId: input.correlationId,
            error: error instanceof Error ? error.message : 'unknown',
          });
          return null;
        }
      },
      stop: async (reaction) => {
        try {
          await args.transport.removeProcessingReaction(reaction);
        } catch (error) {
          logger.warn('feishu processing reaction could not be removed', {
            correlationId: input.correlationId,
            error: error instanceof Error ? error.message : 'unknown',
          });
        }
      },
    });
    await actOnDisposition(args.transport, input, disposition);
    await markProcessed(record.correlationId);
  } catch (error) {
    // The event is durably recorded; acknowledge so Feishu stops retrying and
    // let recovery/inspection handle the failure. Never leak details.
    await markRejected(record.correlationId).catch(() => {});
    logger.error('feishu inbound event processing failed', {
      correlationId: record.correlationId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
  return ACK;
}
