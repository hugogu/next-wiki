import { describe, expect, it } from 'vitest';
import { FakeFeishuTransport } from './transport.test-support';

describe('FakeFeishuTransport', () => {
  it('returns the challenge for a url_verification envelope', () => {
    const transport = new FakeFeishuTransport();
    const result = transport.parseWebhook(
      JSON.stringify({ type: 'url_verification', challenge: 'c-123' }),
      {},
    );
    expect(result).toEqual({ kind: 'url_verification', challenge: 'c-123' });
  });

  it('parses a message event envelope', () => {
    const transport = new FakeFeishuTransport();
    const event = {
      eventType: 'im.message.receive_v1',
      tenantKey: 'tenant-a',
      eventId: 'evt-1',
      message: {
        messageId: 'om_1',
        openId: 'ou_1',
        chatId: 'oc_1',
        chatType: 'p2p' as const,
        mentionedBot: false,
        text: 'hello',
      },
    };
    const result = transport.parseWebhook(JSON.stringify({ type: 'event', event }), {});
    expect(result).toEqual({ kind: 'event', event });
  });

  it('rejects a forced-invalid header without parsing', () => {
    const transport = new FakeFeishuTransport();
    const result = transport.parseWebhook('anything', { 'x-fake-invalid': 'bad-signature' });
    expect(result).toEqual({ kind: 'invalid', reason: 'bad-signature' });
  });

  it('rejects malformed JSON', () => {
    const transport = new FakeFeishuTransport();
    expect(transport.parseWebhook('{not json', {})).toEqual({
      kind: 'invalid',
      reason: 'malformed-json',
    });
  });

  it('rejects an explicit __invalid envelope', () => {
    const transport = new FakeFeishuTransport();
    expect(transport.parseWebhook(JSON.stringify({ __invalid: 'stale' }), {})).toEqual({
      kind: 'invalid',
      reason: 'stale',
    });
  });

  it('records sent messages and returns deterministic provider ids', async () => {
    const transport = new FakeFeishuTransport();
    const first = await transport.sendMessage({
      target: { type: 'direct', openId: 'ou_1' },
      text: 'hi',
    });
    const second = await transport.sendMessage({
      target: { type: 'group', chatId: 'oc_1' },
      card: {},
    });
    expect(first.providerMessageId).toBe('om_fake_1');
    expect(second.providerMessageId).toBe('om_fake_2');
    expect(transport.sent).toHaveLength(2);
    expect(transport.sent[0]?.text).toBe('hi');
    transport.reset();
    expect(transport.sent).toHaveLength(0);
  });
});
