import * as lark from '@larksuiteoapi/node-sdk';
import type {
  FeishuAnswerStream,
  FeishuTransport,
  InboundFeishuEvent,
  OutboundMessage,
  ProcessingReaction,
} from './transport-types';
import {
  appendFeishuAnswerSources,
  buildFeishuStreamingAnswerCard,
  FEISHU_STREAM_ANSWER_ELEMENT_ID,
} from './answer-card';
import { getDecryptedConfig } from '@/server/services/feishu-config';

export type TransportConfig = {
  appId: string;
  appSecret: string;
};

const STREAM_UPDATE_INTERVAL_MS = 125;

type FeishuApiResult = { code?: number; msg?: string };

function ensureSuccess(result: FeishuApiResult, operation: string): void {
  if (result.code === undefined || result.code === 0) return;
  throw new Error(`Feishu ${operation} failed (${result.code}): ${result.msg ?? 'unknown error'}`);
}

function receiveTarget(message: OutboundMessage): {
  receiveIdType: 'open_id' | 'chat_id';
  receiveId: string;
} {
  return message.target.type === 'direct'
    ? { receiveIdType: 'open_id', receiveId: message.target.openId }
    : { receiveIdType: 'chat_id', receiveId: message.target.chatId };
}

class CardKitAnswerStream implements FeishuAnswerStream {
  private content = '';
  private lastSentContent = '';
  private sequence = 0;
  private lastSentAt = 0;

  constructor(
    private readonly client: lark.Client,
    private readonly cardId: string,
  ) {}

  async append(text: string): Promise<void> {
    if (!text) return;
    this.content += text;
    if (Date.now() - this.lastSentAt >= STREAM_UPDATE_INTERVAL_MS) await this.sendContent(this.content);
  }

  async complete(citations: { title: string; url: string }[]): Promise<void> {
    const terminalContent = appendFeishuAnswerSources(this.content, citations);
    await this.sendContent(terminalContent, true);
    const result = await this.client.cardkit.v1.card.settings({
      path: { card_id: this.cardId },
      data: {
        settings: JSON.stringify({
          config: {
            streaming_mode: false,
            summary: { content: terminalContent.replace(/\s+/g, ' ').slice(0, 100) },
          },
        }),
        sequence: ++this.sequence,
        uuid: `finish_${this.cardId}_${this.sequence}`,
      },
    });
    ensureSuccess(result, 'finalize streaming card');
  }

  async fail(): Promise<void> {
    const terminalContent = this.content || '暂时无法生成回答，请稍后重试。';
    try {
      await this.sendContent(terminalContent, true);
      const result = await this.client.cardkit.v1.card.settings({
        path: { card_id: this.cardId },
        data: {
          settings: JSON.stringify({ config: { streaming_mode: false } }),
          sequence: ++this.sequence,
          uuid: `fail_${this.cardId}_${this.sequence}`,
        },
      });
      ensureSuccess(result, 'finalize failed streaming card');
    } catch {
      // A failed stream must not hide the original AI job failure.
    }
  }

  private async sendContent(content: string, force = false): Promise<void> {
    if (!force && content === this.lastSentContent) return;
    const result = await this.client.cardkit.v1.cardElement.content({
      path: { card_id: this.cardId, element_id: FEISHU_STREAM_ANSWER_ELEMENT_ID },
      data: {
        content: content || '正在生成…',
        sequence: ++this.sequence,
        uuid: `content_${this.cardId}_${this.sequence}`,
      },
    });
    ensureSuccess(result, 'update streaming card');
    this.lastSentContent = content;
    this.lastSentAt = Date.now();
  }
}

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
      const { receiveIdType, receiveId } = receiveTarget(message);
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

    async startAnswerStream(message: OutboundMessage): Promise<FeishuAnswerStream> {
      const card = buildFeishuStreamingAnswerCard();
      const created = await client.cardkit.v1.card.create({
        data: { type: 'card_json', data: JSON.stringify(card) },
      });
      ensureSuccess(created, 'create streaming card');
      const cardId = created.data?.card_id;
      if (!cardId) throw new Error('Feishu did not return a streaming card id');

      const { receiveIdType, receiveId } = receiveTarget(message);
      const sent = await client.im.message.create({
        params: { receive_id_type: receiveIdType },
        data: {
          receive_id: receiveId,
          msg_type: 'interactive',
          content: JSON.stringify({ type: 'card', data: { card_id: cardId } }),
          uuid: message.requestUuid,
        },
      });
      ensureSuccess(sent, 'send streaming card');
      if (!sent.data?.message_id) throw new Error('Feishu did not return a streaming message id');
      return new CardKitAnswerStream(client, cardId);
    },

    async requestPendingScopes(): Promise<void> {
      const result = await client.application.v6.scope.apply();
      ensureSuccess(result, 'apply for pending app scopes');
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
