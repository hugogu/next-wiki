import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { HybridSearchQueryInput } from '@next-wiki/shared';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildUserCtx } from '@/server/permissions';
import { createPublicApiUser, ensurePublicApiDefaultSpace } from '../../../test/public-wiki-api-fixtures';
import {
  ensureEngineRuns,
  getEngineRuns,
  getOrCreateSearchRecord,
  recordSearchBehavior,
  updateEngineRun,
  updateSearchRecord,
} from './search-analytics';

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

    await recordSearchBehavior(ctx, {
      kind: 'behavior', eventId: randomUUID(), searchRecordId: record.id,
      searchSessionId: input.searchSessionId, action: 'result_open', pageId,
    });
    const selection = await db.query.searchBehaviors.findFirst({ where: eq(schema.searchBehaviors.searchRecordId, record.id) });
    expect(selection).toMatchObject({ action: 'result_open', pageId });

    const persisted = await db.query.searchRecords.findFirst({ where: eq(schema.searchRecords.id, record.id) });
    expect(persisted).toBeDefined();
    expect(persisted).not.toHaveProperty('excerpt');
    expect(persisted).not.toHaveProperty('items');

    await db.delete(schema.searchBehaviors).where(eq(schema.searchBehaviors.searchRecordId, record.id));
    await db.delete(schema.pages).where(eq(schema.pages.id, pageId));
    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
  });

  it('attributes anonymous records to the search session and updates aggregate semantic state', async () => {
    const space = await ensurePublicApiDefaultSpace();
    const input = queryInput();
    const record = await getOrCreateSearchRecord(buildAnonymousCtx(), input, space!.id, summary);

    expect(record.actorUserId).toBeNull();
    expect(record.sessionId).toBe(input.searchSessionId);
    await updateSearchRecord(record.id, {
      keywordResultCount: 2,
      semanticResultCount: 1,
      resultCount: 2,
      semanticState: 'ready',
    });
    const updated = await db.query.searchRecords.findFirst({ where: eq(schema.searchRecords.id, record.id) });
    expect(updated).toMatchObject({
      keywordResultCount: 2,
      semanticResultCount: 1,
      resultCount: 2,
      semanticState: 'ready',
      actorUserId: null,
    });

    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
  });

  it('persists the accepted capability snapshot at creation and never rewrites it on retry (017 FR-010)', async () => {
    const space = await ensurePublicApiDefaultSpace();
    const ctx = buildAnonymousCtx();
    const input = queryInput();
    const snapshot = { full_text: true, fuzzy: false, semantic: true };

    const record = await getOrCreateSearchRecord(ctx, input, space!.id, summary, snapshot);
    expect(record.capabilitySnapshot).toEqual(snapshot);

    // A retry after an administrator setting change must keep the accepted set.
    const retry = await getOrCreateSearchRecord(ctx, input, space!.id, summary, { full_text: true, fuzzy: true, semantic: true });
    expect(retry.capabilitySnapshot).toEqual(snapshot);

    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
  });

  it('creates exactly one run per enabled capability, even across concurrent retries (017)', async () => {
    const space = await ensurePublicApiDefaultSpace();
    const input = queryInput();
    const snapshot = { full_text: true, fuzzy: true, semantic: false };
    const record = await getOrCreateSearchRecord(buildAnonymousCtx(), input, space!.id, summary, snapshot);

    const [first, second] = await Promise.all([
      ensureEngineRuns(record.id, snapshot),
      ensureEngineRuns(record.id, snapshot),
    ]);

    expect(first.map((run) => run.capabilityId).sort()).toEqual(['full_text', 'fuzzy']);
    expect(second.map((run) => run.capabilityId).sort()).toEqual(['full_text', 'fuzzy']);
    expect(first.every((run) => run.state === 'pending')).toBe(true);
    // Disabled capability never creates a run row.
    expect(first.some((run) => run.capabilityId === 'semantic')).toBe(false);

    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
  });

  it('transitions run lifecycle states with safe fields only and cascades with its record (017)', async () => {
    const space = await ensurePublicApiDefaultSpace();
    const input = queryInput();
    const snapshot = { full_text: true, fuzzy: false, semantic: true };
    const record = await getOrCreateSearchRecord(buildAnonymousCtx(), input, space!.id, summary, snapshot);
    await ensureEngineRuns(record.id, snapshot);

    await updateEngineRun(record.id, 'semantic', { state: 'pending', continuationRef: 'action-123' });
    await updateEngineRun(record.id, 'full_text', { state: 'ready', resultCount: 3 });

    const runs = await getEngineRuns(record.id);
    const semantic = runs.find((run) => run.capabilityId === 'semantic');
    const fullText = runs.find((run) => run.capabilityId === 'full_text');
    expect(semantic).toMatchObject({ state: 'pending', continuationRef: 'action-123', completedAt: null });
    expect(fullText?.state).toBe('ready');
    expect(fullText?.resultCount).toBe(3);
    expect(fullText?.completedAt).toBeInstanceOf(Date);
    // Run rows persist no result bodies or diagnostics.
    expect(fullText).not.toHaveProperty('items');
    expect(fullText).not.toHaveProperty('excerpt');
    expect(fullText).not.toHaveProperty('error');

    await updateEngineRun(record.id, 'semantic', { state: 'timed_out' });
    const timedOut = (await getEngineRuns(record.id)).find((run) => run.capabilityId === 'semantic');
    expect(timedOut?.state).toBe('timed_out');
    expect(timedOut?.completedAt).toBeInstanceOf(Date);

    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
    expect(await getEngineRuns(record.id)).toEqual([]);
  });

  it('rejects a negative result count at the database boundary (017)', async () => {
    const space = await ensurePublicApiDefaultSpace();
    const input = queryInput();
    const record = await getOrCreateSearchRecord(buildAnonymousCtx(), input, space!.id, summary);

    await expect(db.insert(schema.searchEngineRuns).values({
      searchRecordId: record.id,
      capabilityId: 'full_text',
      resultCount: -1,
    })).rejects.toThrow();

    await db.delete(schema.searchRecords).where(eq(schema.searchRecords.id, record.id));
  });
});

afterAll(async () => {
  await closeDb();
});
