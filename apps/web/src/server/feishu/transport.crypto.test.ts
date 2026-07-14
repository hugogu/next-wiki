import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFeishuTransport } from './transport';

const ENCRYPT_KEY = 'test-encrypt-key-0123456789';

/** Encrypt a payload exactly as the Feishu open platform does (AES-256-CBC,
 * key = sha256(encryptKey), output = base64(iv || ciphertext)). */
function encryptV2(obj: unknown): string {
  const key = crypto.createHash('sha256').update(ENCRYPT_KEY).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, enc]).toString('base64');
}

function sign(timestamp: string, nonce: string, rawBody: string): string {
  return crypto
    .createHash('sha256')
    .update(timestamp + nonce + ENCRYPT_KEY + rawBody)
    .digest('hex');
}

const transport = createFeishuTransport({
  appId: 'cli_test',
  appSecret: 'secret',
  encryptKey: ENCRYPT_KEY,
  verificationToken: null,
});

describe('createFeishuTransport.parseWebhook', () => {
  it('decrypts and returns a url_verification challenge', () => {
    const raw = JSON.stringify({ encrypt: encryptV2({ type: 'url_verification', challenge: 'ch-1' }) });
    expect(transport.parseWebhook(raw, {})).toEqual({ kind: 'url_verification', challenge: 'ch-1' });
  });

  it('decrypts a v2 message event and normalizes it', () => {
    const payload = {
      schema: '2.0',
      header: {
        event_id: 'evt-9',
        event_type: 'im.message.receive_v1',
        tenant_key: 'tenant-x',
      },
      event: {
        sender: { sender_id: { open_id: 'ou_sender' } },
        message: {
          message_id: 'om_9',
          chat_id: 'oc_9',
          chat_type: 'p2p',
          content: JSON.stringify({ text: 'how do I reset a key?' }),
          mentions: [],
        },
      },
    };
    const raw = JSON.stringify({ encrypt: encryptV2(payload) });
    const result = transport.parseWebhook(raw, {});
    expect(result).toEqual({
      kind: 'event',
      event: {
        eventType: 'im.message.receive_v1',
        tenantKey: 'tenant-x',
        eventId: 'evt-9',
        message: {
          messageId: 'om_9',
          openId: 'ou_sender',
          chatId: 'oc_9',
          chatType: 'p2p',
          mentionedBot: false,
          text: 'how do I reset a key?',
        },
      },
    });
  });

  it('accepts a valid signature and rejects a tampered one', () => {
    const raw = JSON.stringify({ encrypt: encryptV2({ type: 'url_verification', challenge: 'ch-2' }) });
    const ts = '1720000000';
    const nonce = 'n-1';
    const good = { 'x-lark-request-timestamp': ts, 'x-lark-request-nonce': nonce, 'x-lark-signature': sign(ts, nonce, raw) };
    expect(transport.parseWebhook(raw, good).kind).toBe('url_verification');

    const bad = { ...good, 'x-lark-signature': 'deadbeef' };
    expect(transport.parseWebhook(raw, bad)).toEqual({ kind: 'invalid', reason: 'bad-signature' });
  });

  it('rejects an undecryptable envelope', () => {
    const raw = JSON.stringify({ encrypt: 'not-valid-base64-ciphertext' });
    expect(transport.parseWebhook(raw, {}).kind).toBe('invalid');
  });
});

describe('createFeishuTransport verification token', () => {
  it('rejects a url_verification with a mismatched token', () => {
    const t = createFeishuTransport({
      appId: 'cli_test',
      appSecret: 'secret',
      encryptKey: ENCRYPT_KEY,
      verificationToken: 'expected-token',
    });
    const raw = JSON.stringify({
      encrypt: encryptV2({ type: 'url_verification', challenge: 'ch', token: 'wrong' }),
    });
    expect(t.parseWebhook(raw, {})).toEqual({ kind: 'invalid', reason: 'bad-token' });
  });
});
