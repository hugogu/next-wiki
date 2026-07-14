import { describe, expect, it } from 'vitest';
import { FakeFeishuTransport } from './transport.test-support';
import { buildInboundEvent } from './transport';

describe('FakeFeishuTransport', () => {
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

  it('normalizes a long-connection message event', () => {
    expect(
      buildInboundEvent({
        event_type: 'im.message.receive_v1',
        event_id: 'evt-1',
        tenant_key: 'tenant-a',
        sender: { sender_id: { open_id: 'ou_1' } },
        message: {
          message_id: 'om_1',
          chat_id: 'oc_1',
          chat_type: 'group',
          mentions: [{}],
          content: JSON.stringify({ text: 'hello' }),
        },
      }),
    ).toEqual({
      eventType: 'im.message.receive_v1',
      eventId: 'evt-1',
      tenantKey: 'tenant-a',
      message: {
        messageId: 'om_1',
        openId: 'ou_1',
        chatId: 'oc_1',
        chatType: 'group',
        mentionedBot: true,
        text: 'hello',
      },
    });
  });
});
