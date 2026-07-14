import * as lark from '@larksuiteoapi/node-sdk';
import type {
  FeishuTransport,
  InboundFeishuEvent,
  OutboundMessage,
  ProcessingReaction,
} from './transport-types';
import { getDecryptedConfig } from '@/server/services/feishu-config';

export type TransportConfig = {
  appId: string;
  appSecret: string;
};

function extractText(content: unknown): string {
  if (typeof content !== 'string') return '';
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return typeof parsed.text === 'string' ? parsed.text : '';
  } catch {
    return '';
  }
}

/** Build our normalized event shape from a Feishu SDK long-connection payload. */
export function buildInboundEvent(payload: Record<string, unknown>): InboundFeishuEvent | null {
  const headerObj = (payload.header ?? payload) as Record<string, unknown> | undefined;
  if (!headerObj || typeof headerObj.event_type !== 'string') return null;
  const eventType = headerObj.event_type;
  const tenantKey = typeof headerObj.tenant_key === 'string' ? headerObj.tenant_key : 'default';
  const eventId = typeof headerObj.event_id === 'string' ? headerObj.event_id : '';

  const base: InboundFeishuEvent = { eventType, tenantKey, eventId };
  if (eventType === 'im.message.receive_v1') {
    const event = (payload.event ?? payload) as Record<string, unknown> | undefined;
    const message = event?.message as Record<string, unknown> | undefined;
    const sender = event?.sender as Record<string, unknown> | undefined;
    const senderId = sender?.sender_id as Record<string, unknown> | undefined;
    const mentions = Array.isArray(message?.mentions) ? message?.mentions : [];
    if (message && senderId && typeof senderId.open_id === 'string') {
      base.message = {
        messageId: typeof message.message_id === 'string' ? message.message_id : '',
        openId: senderId.open_id,
        chatId: typeof message.chat_id === 'string' ? message.chat_id : '',
        chatType: message.chat_type === 'group' ? 'group' : 'p2p',
        mentionedBot: mentions.length > 0,
        text: extractText(message.content),
      };
    }
  }
  return base;
}

/** Build a real Feishu transport from decrypted configuration. */
export function createFeishuTransport(config: TransportConfig): FeishuTransport {
  const client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    loggerLevel: lark.LoggerLevel.error,
  });

  return {
    async sendMessage(message: OutboundMessage): Promise<{ providerMessageId: string }> {
      const receiveIdType = message.target.type === 'direct' ? 'open_id' : 'chat_id';
      const receiveId =
        message.target.type === 'direct' ? message.target.openId : message.target.chatId;
      const msgType = message.card ? 'interactive' : 'text';
      const content = message.card
        ? JSON.stringify(message.card)
        : JSON.stringify({ text: message.text ?? '' });
      const res = await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: { receive_id: receiveId, msg_type: msgType, content, uuid: message.requestUuid },
      });
      return { providerMessageId: res?.data?.message_id ?? '' };
    },

    async addProcessingReaction(messageId: string): Promise<ProcessingReaction> {
      const res = await client.im.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: 'THINKING' } },
      });
      const reactionId = res?.data?.reaction_id;
      if (!reactionId) throw new Error('Feishu did not return a processing reaction id');
      return { messageId, reactionId };
    },

    async removeProcessingReaction(reaction: ProcessingReaction): Promise<void> {
      await client.im.messageReaction.delete({
        path: { message_id: reaction.messageId, reaction_id: reaction.reactionId },
      });
    },
  };
}

/**
 * Resolve the active transport from the encrypted configuration, or null when
 * the integration is disabled/unconfigured. Callers treat null as inactive.
 */
export async function getFeishuTransport(): Promise<FeishuTransport | null> {
  const config = await getDecryptedConfig();
  if (!config) return null;
  return createFeishuTransport({
    appId: config.appId,
    appSecret: config.appSecret,
  });
}
