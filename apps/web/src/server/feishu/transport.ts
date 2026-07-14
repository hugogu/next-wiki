import crypto from 'node:crypto';
import * as lark from '@larksuiteoapi/node-sdk';
import type {
  FeishuTransport,
  InboundFeishuEvent,
  OutboundMessage,
  WebhookParseResult,
} from './transport-types';
import { getDecryptedConfig } from '@/server/services/feishu-config';

export type TransportConfig = {
  appId: string;
  appSecret: string;
  encryptKey: string;
  verificationToken: string | null;
};

/** Lowercase header lookups so callers can pass raw Next.js header maps. */
function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()];
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

/** Build our normalized event shape from a decrypted Feishu v2 payload. */
function buildEvent(payload: Record<string, unknown>): InboundFeishuEvent | null {
  const headerObj = payload.header as Record<string, unknown> | undefined;
  if (!headerObj || typeof headerObj.event_type !== 'string') return null;
  const eventType = headerObj.event_type;
  const tenantKey = typeof headerObj.tenant_key === 'string' ? headerObj.tenant_key : 'default';
  const eventId = typeof headerObj.event_id === 'string' ? headerObj.event_id : '';

  const base: InboundFeishuEvent = { eventType, tenantKey, eventId };
  if (eventType === 'im.message.receive_v1') {
    const event = payload.event as Record<string, unknown> | undefined;
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

/**
 * Build a real Feishu transport from decrypted configuration. Event v2 payloads
 * are verified (signature over the raw body when present) and decrypted with the
 * SDK's `AESCipher`; messages are sent through the SDK client with the delivery
 * id forwarded as the idempotency `uuid`.
 */
export function createFeishuTransport(config: TransportConfig): FeishuTransport {
  const cipher = new lark.AESCipher(config.encryptKey);
  const client = new lark.Client({
    appId: config.appId,
    appSecret: config.appSecret,
    loggerLevel: lark.LoggerLevel.error,
  });

  function signatureValid(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const signature = header(headers, 'x-lark-signature');
    // Feishu only sends a signature when the Encrypt Key is configured on the
    // callback; the payload is already AES-authenticated, so a missing signature
    // is not treated as invalid, but a present one must match.
    if (!signature) return true;
    const timestamp = header(headers, 'x-lark-request-timestamp');
    const nonce = header(headers, 'x-lark-request-nonce');
    if (!timestamp || !nonce) return false;
    const digest = crypto
      .createHash('sha256')
      .update(timestamp + nonce + config.encryptKey + rawBody)
      .digest('hex');
    const a = Buffer.from(digest);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  return {
    parseWebhook(rawBody, headers): WebhookParseResult {
      if (!signatureValid(rawBody, headers)) return { kind: 'invalid', reason: 'bad-signature' };

      let outer: Record<string, unknown>;
      try {
        outer = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return { kind: 'invalid', reason: 'malformed-json' };
      }

      let payload = outer;
      if (typeof outer.encrypt === 'string') {
        let decrypted: string;
        try {
          decrypted = cipher.decrypt(outer.encrypt);
        } catch {
          return { kind: 'invalid', reason: 'decrypt-failed' };
        }
        try {
          payload = JSON.parse(decrypted) as Record<string, unknown>;
        } catch {
          return { kind: 'invalid', reason: 'malformed-decrypted' };
        }
      }

      // URL verification challenge (handled before any business processing).
      if (payload.type === 'url_verification' && typeof payload.challenge === 'string') {
        if (config.verificationToken && payload.token !== config.verificationToken) {
          return { kind: 'invalid', reason: 'bad-token' };
        }
        return { kind: 'url_verification', challenge: payload.challenge };
      }

      const headerObj = payload.header as Record<string, unknown> | undefined;
      if (
        config.verificationToken &&
        headerObj &&
        typeof headerObj.token === 'string' &&
        headerObj.token !== config.verificationToken
      ) {
        return { kind: 'invalid', reason: 'bad-token' };
      }

      const event = buildEvent(payload);
      if (!event) return { kind: 'invalid', reason: 'unrecognized-envelope' };
      return { kind: 'event', event };
    },

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
    encryptKey: config.encryptKey,
    verificationToken: config.verificationToken,
  });
}
