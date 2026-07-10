import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { HybridSearchQueryInput } from '@next-wiki/shared';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { createPublicApiUser, ensurePublicApiDefaultSpace } from '../../../test/public-wiki-api-fixtures';
import { getOrCreateSearchRecord, recordSearchBehavior } from './search-analytics';

const summary = {
  keywordResultCount: 1,
  semanticResultCount: 0,
  resultCount: 1,
  semanticState: 'unavailable' as const,
};

function queryInput(overrides: Partial<HybridSearchQueryInput> = {}): HybridSearchQueryInput {
  return {
    kind: 'query',
    searchRecordId: randomUUID(),
    searchSessionId: randomUUID(),
    q: 'hybrid search',
    limit: 20,
    ...overrides,
  };
}

describe('search analytics persistence', () => {
  it('reuses a query UUID only for its owner, session, and normalized query', async () => {
    const [space, user] = await Promise.all([
      ensurePublicApiDefaultSpace(),
      createPublicApiUser(`search-analytics-${randomUUID()}@example.com`, 'editor'),
    ]);
    const ctx = buildUserCtx(user.id, 'editor');
    const input = queryInput({ q: '  hybrid search  ' });

    const first = await getOrCreateSearchRecord(ctx, input, space!.id, summary);
    const retry = await getOrCreateSearchRecord(ctx, input, space!.id, summary);

    expect(retry.id).toBe(first.id);
    await expect(getOrCreateSearchRecord(ctx, { ...input, q: 'different query' }, space!.id, summary))
      .rejects.toMatchObject({ code: 'CONFLICT' });

    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, first.id));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  });

  it('records duplicate events once and rejects a different session owner', async () => {
    const [space, user] = await Promise.all([
      ensurePublicApiDefaultSpace(),
      createPublicApiUser(`search-analytics-${randomUUID()}@example.com`, 'editor'),
    ]);
    const ctx = buildUserCtx(user.id, 'editor');
    const input = queryInput();
    const record = await getOrCreateSearchRecord(ctx, input, space!.id, summary);
    const eventId = randomUUID();
    const event = {
      kind: 'behavior' as const,
      eventId,
      searchRecordId: record.id,
      searchSessionId: input.searchSessionId,
      action: 'escape' as const,
    };

    await recordSearchBehavior(ctx, event);
    await recordSearchBehavior(ctx, event);
    const events = await db.select().from(schema.searchBehaviors).where(eq(schema.searchBehaviors.id, eventId));
    expect(events).toHaveLength(1);
    await expect(recordSearchBehavior(ctx, { ...event, eventId: randomUUID(), searchSessionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });

    await db.delete(schema.searchBehaviors).where(eq(schema.searchBehaviors.searchRecordId, record.id));
    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  });

  it('enforces behavior foreign keys and the action/page shape without persisting excerpts', async () => {
    const [space, user] = await Promise.all([
      ensurePublicApiDefaultSpace(),
      createPublicApiUser(`search-analytics-${randomUUID()}@example.com`, 'editor'),
    ]);
    const ctx = buildUserCtx(user.id, 'editor');
    const input = queryInput();
    const record = await getOrCreateSearchRecord(ctx, input, space!.id, summary);
    const pageId = randomUUID();
    await db.insert(schema.pages).values({
      id: pageId,
      spaceId: space!.id,
      slug: 'analytics-page',
      path: `analytics/${pageId}`,
      title: 'Analytics page',
      authorId: user.id,
    });

    await expect(db.insert(schema.searchBehaviors).values({
      id: randomUUID(), searchRecordId: record.id, actorUserId: user.id, action: 'escape', pageId,
    })).rejects.toThrow();
    await expect(db.insert(schema.searchBehaviors).values({
      id: randomUUID(), searchRecordId: randomUUID(), actorUserId: user.id, action: 'escape', pageId: null,
    })).rejects.toThrow();

    const persisted = await db.query.searchRecords.findFirst({ where: eq(schema.searchRecords.id, record.id) });
    expect(persisted).toBeDefined();
    expect(persisted).not.toHaveProperty('excerpt');
    expect(persisted).not.toHaveProperty('items');

    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  });
});

afterAll(async () => {
  await closeDb();
});
