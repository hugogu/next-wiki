import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { FakeFeishuTransport } from '@/server/feishu/transport.test-support';
import { processWebhook } from '@/server/feishu/webhook-handler';

type MessageOpts = {
  messageId?: string;
  openId?: string;
  chatId?: string;
  chatType?: 'p2p' | 'group';
  mentionedBot?: boolean;
  text?: string;
};

function messageEnvelope(opts: MessageOpts = {}): string {
  return JSON.stringify({
    type: 'event',
    event: {
      eventType: 'im.message.receive_v1',
      tenantKey: 'tenant-1',
      eventId: 'evt-1',
      message: {
        messageId: opts.messageId ?? 'om_1',
        openId: opts.openId ?? 'ou_user',
        chatId: opts.chatId ?? 'oc_chat',
        chatType: opts.chatType ?? 'p2p',
        mentionedBot: opts.mentionedBot ?? false,
        text: opts.text ?? 'hello',
      },
    },
  });
}

async function cleanup() {
  await db.delete(schema.feishuBindingTokens);
  await db.delete(schema.feishuInboxEvents);
  await db.delete(schema.feishuBotSessions);
  await db.delete(schema.feishuBindings);
  await db.delete(schema.users);
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('feishu webhook processing', () => {
  it('answers the URL verification challenge', async () => {
    const transport = new FakeFeishuTransport();
    const result = await processWebhook({
      transport,
      rawBody: JSON.stringify({ type: 'url_verification', challenge: 'ch-1' }),
      headers: {},
    });
    expect(result).toEqual({ status: 200, body: { challenge: 'ch-1' } });
    expect(transport.sent).toHaveLength(0);
  });

  it('rejects an invalid/stale payload with a generic 400', async () => {
    const transport = new FakeFeishuTransport();
    const result = await processWebhook({
      transport,
      rawBody: 'anything',
      headers: { 'x-fake-invalid': 'bad-signature' },
    });
    expect(result.status).toBe(400);
    expect(transport.sent).toHaveLength(0);
  });

  it('DMs a single-use binding link to an unbound direct-message user', async () => {
    const transport = new FakeFeishuTransport();
    const result = await processWebhook({ transport, rawBody: messageEnvelope(), headers: {} });
    expect(result.status).toBe(200);

    // One DM to the user containing the bind URL; nothing posted to a group.
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.target).toEqual({ type: 'direct', openId: 'ou_user' });
    expect(transport.sent[0]?.text).toContain('/user-center/feishu/bind?token=');

    // A single-use token and an inbox record were persisted.
    const tokens = await db.select().from(schema.feishuBindingTokens);
    expect(tokens).toHaveLength(1);
    const inbox = await db.select().from(schema.feishuInboxEvents);
    expect(inbox).toHaveLength(1);
  });

  it('is idempotent for a duplicate message_id', async () => {
    const transport = new FakeFeishuTransport();
    await processWebhook({ transport, rawBody: messageEnvelope({ messageId: 'om_dup' }), headers: {} });
    transport.reset();
    // Same message id again → no new token, no new send.
    await processWebhook({ transport, rawBody: messageEnvelope({ messageId: 'om_dup' }), headers: {} });
    expect(transport.sent).toHaveLength(0);
    const tokens = await db.select().from(schema.feishuBindingTokens);
    expect(tokens).toHaveLength(1);
  });

  it('never posts a binding link in a group; sends a generic group hint instead', async () => {
    const transport = new FakeFeishuTransport();
    await processWebhook({
      transport,
      rawBody: messageEnvelope({ chatType: 'group', mentionedBot: true }),
      headers: {},
    });
    const direct = transport.sent.find((m) => m.target.type === 'direct');
    const group = transport.sent.find((m) => m.target.type === 'group');
    expect(direct?.text).toContain('/user-center/feishu/bind?token=');
    // The group message must NOT contain the link.
    expect(group?.text ?? '').not.toContain('token=');
  });

  it('ignores a group message that does not mention the bot', async () => {
    const transport = new FakeFeishuTransport();
    await processWebhook({
      transport,
      rawBody: messageEnvelope({ chatType: 'group', mentionedBot: false }),
      headers: {},
    });
    expect(transport.sent).toHaveLength(0);
  });

  it('takes no action for an already-bound user in US1 scope', async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ email: 'bound@example.com', passwordHash: 'HASH' })
      .returning();
    await db
      .insert(schema.feishuBindings)
      .values({ userId: user!.id, openId: 'ou_bound', status: 'active' });

    const transport = new FakeFeishuTransport();
    await processWebhook({
      transport,
      rawBody: messageEnvelope({ openId: 'ou_bound', messageId: 'om_bound' }),
      headers: {},
    });
    expect(transport.sent).toHaveLength(0);
  });
});
