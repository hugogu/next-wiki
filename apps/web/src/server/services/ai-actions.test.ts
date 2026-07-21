import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, createWikiQuestionAction, removeAiTestUser } from '../../../test/ai-fixtures';

const jobsRuntime = vi.hoisted(() => ({
  enqueue: vi.fn(async (_queue: string, _data: Record<string, unknown>, _options?: unknown) => 'job-id'),
}));
vi.mock('@/server/jobs/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/jobs/runtime')>();
  return { ...actual, enqueue: jobsRuntime.enqueue };
});

import {
  appendActionEvent,
  createAction,
  deleteSession,
  finishAction,
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
import { QUEUES } from '@/server/jobs/runtime';

describe('AI actions', () => {
  let userId: string;
  beforeEach(async () => {
    await clearAiData();
    jobsRuntime.enqueue.mockClear();
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

  it('resolves the page path for actions tied to a page', async () => {
    const ctx = buildUserCtx(userId, 'admin');
    const [space] = await db.insert(schema.spaces).values({ slug: `aa-${userId}`, name: 'AA' }).returning();
    const [page] = await db
      .insert(schema.pages)
      .values({ spaceId: space!.id, slug: 'doc', path: 'docs/doc', title: 'Doc', authorId: userId })
      .returning();
    const action = await createAction(ctx, {
      feature: 'index_rebuild',
      input: { generationId: 'gen' },
      pageId: page!.id,
    });

    const view = await getAction(ctx, action.id);
    expect(view.pageId).toBe(page!.id);
    expect(view.pagePath).toBe('docs/doc');

    await db.delete(schema.pages).where(eq(schema.pages.id, page!.id));
    await db.delete(schema.spaces).where(eq(schema.spaces.id, space!.id));
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

    it('prefers the durable Raw-derived question once the event-log question has expired (023)', async () => {
      const ctx = buildUserCtx(userId, 'admin');
      const expiresAt = new Date(Date.now() + 60_000);
      const [space] = await db
        .insert(schema.spaces)
        .values({ slug: `history-raw-${userId}`, name: 'Raw', kind: 'raw', anonymousRead: false })
        .returning();
      const [page] = await db
        .insert(schema.pages)
        .values({
          spaceId: space!.id, slug: 'captured', path: `history-captured-${userId}`, title: 'Conversation: captured',
          authorId: userId, nature: 'original', visibility: 'restricted',
        })
        .returning();
      const [revision] = await db
        .insert(schema.pageRevisions)
        .values({
          pageId: page!.id, versionNumber: 1, contentType: 'text/markdown', contentSource: 'transcript',
          contentHtml: '<p>transcript</p>', contentHash: 'hash', authorId: userId, status: 'published',
          actorKind: 'machine', sourceMetadata: { question: 'What is the durable capture question?' }, publishedAt: new Date(),
        })
        .returning();
      await db.update(schema.pages).set({ currentPublishedVersionId: revision!.id, latestVersionId: revision!.id }).where(eq(schema.pages.id, page!.id));

      const [captured] = await db.insert(schema.aiActions).values({
        feature: 'wiki_question', status: 'completed', actorUserId: userId, expiresAt,
        rawConversationPageId: page!.id, rawConversationCaptureStatus: 'captured',
      }).returning();
      // No 'question' event exists at all — simulates the retention window
      // having already elapsed for this captured session.

      const { items } = await listUserSessions(ctx);
      const row = items.find((item) => item.id === captured!.id);
      expect(row?.questionExcerpt).toBe('What is the durable capture question?');
      expect(row?.rawConversation).toMatchObject({ pageId: page!.id, captureStatus: 'captured' });

      const search = await listUserSessions(ctx, { search: 'durable capture' });
      expect(search.items.map((item) => item.id)).toContain(captured!.id);

      await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.id, revision!.id));
      await db.delete(schema.pages).where(eq(schema.pages.id, page!.id));
      await db.delete(schema.spaces).where(eq(schema.spaces.id, space!.id));
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

    it('rejects deleting a captured session, preserving its Raw Conversation pointer (023)', async () => {
      const ctx = buildUserCtx(userId, 'admin');
      const expiresAt = new Date(Date.now() + 60_000);
      const [space] = await db
        .insert(schema.spaces)
        .values({ slug: `history-delete-raw-${userId}`, name: 'Raw', kind: 'raw', anonymousRead: false })
        .returning();
      const [page] = await db
        .insert(schema.pages)
        .values({
          spaceId: space!.id, slug: 'captured-delete', path: `history-delete-${userId}`, title: 'Conversation',
          authorId: userId, nature: 'original', visibility: 'restricted',
        })
        .returning();
      const [captured] = await db.insert(schema.aiActions).values({
        feature: 'wiki_question', status: 'completed', actorUserId: userId, expiresAt,
        rawConversationPageId: page!.id, rawConversationCaptureStatus: 'captured',
      }).returning();

      await expect(deleteSession(ctx, captured!.id)).rejects.toMatchObject({ code: 'RAW_CONVERSATION_IMMUTABLE' });
      const stillThere = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, captured!.id) });
      expect(stillThere).toMatchObject({ rawConversationPageId: page!.id });
      expect(await db.query.pages.findFirst({ where: eq(schema.pages.id, page!.id) })).toBeTruthy();

      await db.delete(schema.aiActions).where(eq(schema.aiActions.id, captured!.id));
      await db.delete(schema.pages).where(eq(schema.pages.id, page!.id));
      await db.delete(schema.spaces).where(eq(schema.spaces.id, space!.id));
    });
  });

  describe('raw conversation capture triggers (023)', () => {
    // appendActionEvent enqueues capture fire-and-forget (never blocking the
    // streaming caller), so assertions poll briefly instead of racing it.
    async function waitForEnqueueCall(timeoutMs = 500): Promise<void> {
      const start = Date.now();
      while (jobsRuntime.enqueue.mock.calls.length === 0) {
        if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for enqueue() call');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    it('enqueues capture when an event is appended to a pending-capture wiki_question action', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
      await appendActionEvent(actionId, 'question', { text: 'Where is the config?' });
      await waitForEnqueueCall();
      expect(jobsRuntime.enqueue).toHaveBeenCalledWith(
        QUEUES.rawConversationCapture,
        { actionId },
        { singletonKey: actionId, singletonNextSlot: true },
      );
    });

    it('enqueues capture again on the terminal event finishAction appends', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'captured', rawConversationPageId: null });
      jobsRuntime.enqueue.mockClear();
      await finishAction(actionId, 'completed', { resultMetadata: { insufficientEvidence: false } });
      await waitForEnqueueCall();
      expect(jobsRuntime.enqueue).toHaveBeenCalledWith(
        QUEUES.rawConversationCapture,
        { actionId },
        expect.anything(),
      );
    });

    it('never enqueues capture for a disabled or not_applicable action', async () => {
      const disabled = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'disabled' });
      await appendActionEvent(disabled, 'question', { text: 'q' });
      const notApplicable = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'not_applicable' });
      await appendActionEvent(notApplicable, 'question', { text: 'q' });
      // Give the fire-and-forget checks a moment to (not) fire, then assert none did.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const captureCalls = jobsRuntime.enqueue.mock.calls.filter(([queue]) => queue === QUEUES.rawConversationCapture);
      expect(captureCalls).toHaveLength(0);
    });

    it('never enqueues capture for a non-wiki_question feature', async () => {
      const ctx = buildUserCtx(userId, 'admin');
      const action = await createAction(ctx, { feature: 'semantic_search', input: { query: 'q' } });
      jobsRuntime.enqueue.mockClear();
      await appendActionEvent(action.id, 'text_delta', { text: 'partial' });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const captureCalls = jobsRuntime.enqueue.mock.calls.filter(([queue]) => queue === QUEUES.rawConversationCapture);
      expect(captureCalls).toHaveLength(0);
    });
  });
});
