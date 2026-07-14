import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as inbox from '@/server/services/feishu-inbox';

beforeEach(async () => {
  await db.delete(schema.feishuInboxEvents);
});

afterAll(async () => {
  await db.delete(schema.feishuInboxEvents);
  await closeDb();
});

describe('feishu-inbox service', () => {
  it('records a first event and reports duplicates as no-ops', async () => {
    const first = await inbox.recordInbound({
      tenantKey: 't1',
      eventType: 'im.message.receive_v1',
      sourceEventId: 'om_1',
      openId: 'ou_1',
      chatId: 'oc_1',
    });
    expect(first.duplicate).toBe(false);

    const second = await inbox.recordInbound({
      tenantKey: 't1',
      eventType: 'im.message.receive_v1',
      sourceEventId: 'om_1',
      openId: 'ou_1',
      chatId: 'oc_1',
    });
    expect(second.duplicate).toBe(true);
    // The duplicate traces back to the original correlation id.
    expect(second.correlationId).toBe(first.correlationId);

    const rows = await db.select().from(schema.feishuInboxEvents);
    expect(rows).toHaveLength(1);
  });

  it('treats a different tenant/type/source as distinct', async () => {
    await inbox.recordInbound({ tenantKey: 't1', eventType: 'e', sourceEventId: 'a' });
    await inbox.recordInbound({ tenantKey: 't1', eventType: 'e', sourceEventId: 'b' });
    await inbox.recordInbound({ tenantKey: 't2', eventType: 'e', sourceEventId: 'a' });
    const rows = await db.select().from(schema.feishuInboxEvents);
    expect(rows).toHaveLength(3);
  });

  it('counts recent per-user and per-chat events for rate limiting', async () => {
    for (let i = 0; i < 3; i += 1) {
      await inbox.recordInbound({
        tenantKey: 't1',
        eventType: 'im.message.receive_v1',
        sourceEventId: `om_${i}`,
        openId: 'ou_rate',
        chatId: 'oc_rate',
      });
    }
    const counts = await inbox.recentCounts({ openId: 'ou_rate', chatId: 'oc_rate' });
    expect(counts.user).toBe(3);
    expect(counts.chat).toBe(3);

    expect(await inbox.isWithinRateLimit({ openId: 'ou_rate', chatId: 'oc_rate' }, { userLimit: 10, chatLimit: 30 })).toBe(true);
    expect(await inbox.isWithinRateLimit({ openId: 'ou_rate', chatId: 'oc_rate' }, { userLimit: 2, chatLimit: 30 })).toBe(false);
  });

  it('transitions status to processed/rejected', async () => {
    const { correlationId } = await inbox.recordInbound({
      tenantKey: 't1',
      eventType: 'e',
      sourceEventId: 'x',
    });
    await inbox.markProcessed(correlationId);
    let row = await db.query.feishuInboxEvents.findFirst({
      where: (t, { eq }) => eq(t.correlationId, correlationId),
    });
    expect(row!.status).toBe('processed');

    await inbox.markRejected(correlationId);
    row = await db.query.feishuInboxEvents.findFirst({
      where: (t, { eq }) => eq(t.correlationId, correlationId),
    });
    expect(row!.status).toBe('rejected');
  });
});
