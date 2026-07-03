import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import {
  appendActionEvent,
  createAction,
  deleteSession,
  getAction,
  getActionEvents,
  getAllActionEvents,
  getUsageStats,
  listActions,
  listUserSessions,
  readActionInput,
  recordTerminalAction,
  requestActionCancellation,
  indexRebuildExpireSeconds,
  expireSecondsForFeature,
} from './ai-actions';

describe('AI actions', () => {
  let userId: string;
  beforeEach(async () => {
    await clearAiData();
    userId = await createAiTestUser('admin');
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
  });
  afterEach(async () => removeAiTestUser(userId));

  it('encrypts content inputs and exposes ordered reconnectable events', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    const action = await createAction(ctx, { feature: 'semantic_search', input: { query: 'private' } });
    const stored = await db.query.aiActionInputs.findFirst({ where: eq(schema.aiActionInputs.actionId, action.id) });
    expect(stored?.payloadEncrypted).not.toContain('private');
    expect(await readActionInput(action.id)).toEqual({ query: 'private' });
    const cursor = await appendActionEvent(action.id, 'text_delta', { text: 'hello' });
    expect((await getActionEvents(ctx, action.id, cursor - 1))[0]?.payload).toEqual({ text: 'hello' });
  });

  it('enforces ownership and cancellation state', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    const action = await createAction(ctx, { feature: 'semantic_search', input: { query: 'q' } });
    const cancelled = await requestActionCancellation(ctx, action.id);
    expect(cancelled.status).toBe('queued');
    expect((await getAction(ctx, action.id)).id).toBe(action.id);
  });

  it('paginates the audit listing with limit/offset and a total count', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    await db.insert(schema.aiActions).values(
      Array.from({ length: 5 }, () => ({ feature: 'provider_test' as const, actorUserId: userId, expiresAt })),
    );
    const ctx = buildUserCtx(userId, 'admin');
    const firstPage = await listActions(ctx, { limit: 2, offset: 0 });
    expect(firstPage.total).toBe(5);
    expect(firstPage.items).toHaveLength(2);
    const lastPage = await listActions(ctx, { limit: 2, offset: 4 });
    expect(lastPage.total).toBe(5);
    expect(lastPage.items).toHaveLength(1);
  });

  it('rejects audit listing for callers without manage_ai permission', async () => {
    await expect(listActions(buildUserCtx(userId, 'editor'), {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('records a terminal action with request/response and error detail', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    await recordTerminalAction(ctx, {
      feature: 'provider_test',
      status: 'failed',
      requestMetadata: { mode: 'draft', vendor: 'minimax' },
      resultMetadata: { ok: false, latencyMs: 5 },
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: 'rejected',
      errorDetail: 'stack-trace-here',
    });
    const { items } = await listActions(ctx, { feature: 'provider_test' });
    expect(items[0]).toMatchObject({
      feature: 'provider_test',
      status: 'failed',
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorDetail: 'stack-trace-here',
    });
    expect(items[0]?.requestMetadata).toMatchObject({ mode: 'draft', vendor: 'minimax' });
    expect(items[0]?.resultMetadata).toMatchObject({ ok: false, latencyMs: 5 });
  });

  it('aggregates completed token usage by capability category', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    await db.insert(schema.aiActions).values([
      { feature: 'wiki_question', status: 'completed', actorUserId: userId, usageMetadata: { inputTokens: 100, outputTokens: 50, cachedInputTokens: 10 }, expiresAt },
      { feature: 'text_optimization', status: 'completed', actorUserId: userId, usageMetadata: { inputTokens: 20, outputTokens: 5 }, expiresAt },
      { feature: 'semantic_search', status: 'completed', actorUserId: userId, usageMetadata: { inputTokens: 30 }, expiresAt },
      { feature: 'image_generation', status: 'completed', actorUserId: userId, usageMetadata: {}, expiresAt },
      // Failed actions and operational features are excluded from the totals.
      { feature: 'wiki_question', status: 'failed', actorUserId: userId, usageMetadata: { inputTokens: 999 }, expiresAt },
      { feature: 'provider_test', status: 'completed', actorUserId: userId, usageMetadata: {}, expiresAt },
    ]);
    const stats = await getUsageStats(buildUserCtx(userId, 'admin'));
    expect(stats.chat).toEqual({ requests: 2, inputTokens: 120, outputTokens: 55, cachedInputTokens: 10 });
    expect(stats.embedding).toEqual({ requests: 1, inputTokens: 30, outputTokens: 0, cachedInputTokens: 0 });
    expect(stats.image.requests).toBe(1);
  });

  it('extends the pg-boss expiry window for index rebuilds and leaves interactive actions on the default', () => {
    // A 1396-page rebuild at ~0.5 page/s runs ~47 min, far beyond pg-boss's 15-min
    // default — without an override the job expires mid-build, gets retried, and
    // orphans pages in `running`. Interactive actions keep the short default.
    expect(expireSecondsForFeature('index_rebuild')).toBe(indexRebuildExpireSeconds);
    expect(expireSecondsForFeature('wiki_question')).toBeUndefined();
    expect(expireSecondsForFeature('image_generation')).toBeUndefined();
  });

  it('getAllActionEvents pages past a single call\'s limit instead of silently truncating', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    const action = await createAction(ctx, { feature: 'semantic_search', input: { query: 'q' } });
    for (let i = 0; i < 7; i++) {
      await appendActionEvent(action.id, 'text_delta', { text: `chunk-${i}` });
    }
    const all = await getAllActionEvents(ctx, action.id, 3);
    expect(all.filter((event) => event.type === 'text_delta').map((event) => event.payload.text)).toEqual(
      Array.from({ length: 7 }, (_, i) => `chunk-${i}`),
    );
  });

  describe('user session history', () => {
    it('lists only the caller\'s own wiki_question sessions, with a question excerpt', async () => {
      const ctx = buildUserCtx(userId, 'admin');
      const otherUserId = await createAiTestUser('reader');
      const expiresAt = new Date(Date.now() + 60_000);
      const [mine] = await db.insert(schema.aiActions).values({
        feature: 'wiki_question', status: 'completed', actorUserId: userId, expiresAt,
      }).returning();
      await db.insert(schema.aiActionEvents).values({
        actionId: mine!.id, type: 'question', payload: { text: 'What is pi?' }, expiresAt,
      });
      // A different feature from the same user must not show up here.
      await db.insert(schema.aiActions).values({
        feature: 'text_optimization', status: 'completed', actorUserId: userId, expiresAt,
      });
      // Another user's wiki_question must not show up either, even though this
      // caller is an admin — session history is always self-scoped.
      await db.insert(schema.aiActions).values({
        feature: 'wiki_question', status: 'completed', actorUserId: otherUserId, expiresAt,
      });

      const { items, total } = await listUserSessions(ctx);
      expect(total).toBe(1);
      expect(items[0]).toMatchObject({ id: mine!.id, questionExcerpt: 'What is pi?' });
      await removeAiTestUser(otherUserId);
    });

    it('searches sessions by question text', async () => {
      const ctx = buildUserCtx(userId, 'admin');
      const expiresAt = new Date(Date.now() + 60_000);
      const [a] = await db.insert(schema.aiActions).values({ feature: 'wiki_question', status: 'completed', actorUserId: userId, expiresAt }).returning();
      const [b] = await db.insert(schema.aiActions).values({ feature: 'wiki_question', status: 'completed', actorUserId: userId, expiresAt }).returning();
      await db.insert(schema.aiActionEvents).values([
        { actionId: a!.id, type: 'question', payload: { text: 'Tell me about the Gaussian integral' }, expiresAt },
        { actionId: b!.id, type: 'question', payload: { text: 'What is the capital of France?' }, expiresAt },
      ]);
      const result = await listUserSessions(ctx, { search: 'gaussian' });
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe(a!.id);
    });

    it('hard-deletes a session and cascades its events, but only for the owner', async () => {
      const ctx = buildUserCtx(userId, 'admin');
      const otherUserId = await createAiTestUser('reader');
      const otherCtx = buildUserCtx(otherUserId, 'reader');
      const expiresAt = new Date(Date.now() + 60_000);
      const [action] = await db.insert(schema.aiActions).values({
        feature: 'wiki_question', status: 'completed', actorUserId: userId, expiresAt,
      }).returning();
      await db.insert(schema.aiActionEvents).values({ actionId: action!.id, type: 'question', payload: { text: 'q' }, expiresAt });

      await expect(deleteSession(otherCtx, action!.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

      await deleteSession(ctx, action!.id);
      expect(await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action!.id) })).toBeUndefined();
      expect(await db.query.aiActionEvents.findMany({ where: eq(schema.aiActionEvents.actionId, action!.id) })).toHaveLength(0);
      await removeAiTestUser(otherUserId);
    });
  });
});
