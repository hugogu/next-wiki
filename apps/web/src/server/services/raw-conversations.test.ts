import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  appendConversationEvent,
  clearAiData,
  createAiTestUser,
  createWikiQuestionAction,
  ensureRawSpaceForConversations,
  removeAiTestUser,
  seedCompletedConversationEvents,
} from '../../../test/ai-fixtures';
import { captureConversation, getLatestConversationSnapshot, reconstructConversation } from './raw-conversations';

describe('raw conversations service', () => {
  let userId: string;

  beforeEach(async () => {
    await clearAiData();
    await ensureRawSpaceForConversations();
    userId = await createAiTestUser('reader');
  });

  afterAll(async () => {
    await closeDb();
  });

  afterEach(async () => {
    // Captured pages/revisions are authored by this test's user; clear them
    // first so the FK-restricted authorId reference never blocks user cleanup.
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.authorId, userId));
    await db.delete(schema.pages).where(eq(schema.pages.authorId, userId));
    await removeAiTestUser(userId);
  });

  describe('reconstructConversation', () => {
    it('returns null for a non-wiki_question action', async () => {
      const [action] = await db
        .insert(schema.aiActions)
        .values({ feature: 'semantic_search', status: 'completed', expiresAt: new Date(Date.now() + 3_600_000) })
        .returning({ id: schema.aiActions.id });
      await expect(reconstructConversation(action!.id)).resolves.toBeNull();
    });

    it('reports no content (cursor 0) before any events exist', async () => {
      const actionId = await createWikiQuestionAction(userId);
      const result = await reconstructConversation(actionId);
      expect(result?.eventCursor).toBe(0);
    });

    it('accumulates question, answer, thinking, citations, and timestamps', async () => {
      const actionId = await createWikiQuestionAction(userId, { status: 'completed', startedAt: new Date(), finishedAt: new Date() });
      await appendConversationEvent(actionId, 'question', { text: 'How does capture work?' });
      await appendConversationEvent(actionId, 'reasoning_delta', { text: 'Considering the event log...' });
      await appendConversationEvent(actionId, 'text_delta', { text: 'Capture reconstructs the full transcript.' });
      await appendConversationEvent(actionId, 'citations', {
        citations: [{ pageId: '00000000-0000-4000-8000-000000000001', title: 'Docs', path: 'docs', locale: 'en', revisionId: '00000000-0000-4000-9000-000000000001', revisionHash: 'h' }],
      });
      await appendConversationEvent(actionId, 'completed', { status: 'completed' });

      const result = await reconstructConversation(actionId);
      expect(result).toMatchObject({
        status: 'completed',
        question: 'How does capture work?',
        thinking: 'Considering the event log...',
        answer: 'Capture reconstructs the full transcript.',
        insufficient: false,
        errorMessage: null,
      });
      expect(result?.citations).toHaveLength(1);
      expect(result?.eventCursor).toBeGreaterThan(0);
    });

    it('reports the insufficient-evidence marker as insufficient with an empty answer', async () => {
      const actionId = await createWikiQuestionAction(userId, {
        status: 'completed',
        resultMetadata: { insufficientEvidence: true },
      });
      await appendConversationEvent(actionId, 'question', { text: 'Unanswerable question?' });
      await appendConversationEvent(actionId, 'text_delta', { text: 'INSUFFICIENT_WIKI_EVIDENCE' });
      await appendConversationEvent(actionId, 'completed', { status: 'completed' });

      const result = await reconstructConversation(actionId);
      expect(result?.insufficient).toBe(true);
      expect(result?.answer).toBe('');
    });

    it('captures the error message for a failed conversation', async () => {
      const actionId = await createWikiQuestionAction(userId, { status: 'failed' });
      await appendConversationEvent(actionId, 'question', { text: 'A question' });
      await appendConversationEvent(actionId, 'error', { status: 'failed', code: 'PROVIDER_UNAVAILABLE', message: 'The provider timed out.' });

      const result = await reconstructConversation(actionId);
      expect(result).toMatchObject({ status: 'failed', errorMessage: 'The provider timed out.' });
    });

    it('maps queued actions to a running conversation status', async () => {
      const actionId = await createWikiQuestionAction(userId, { status: 'queued' });
      await appendConversationEvent(actionId, 'question', { text: 'Still queued' });
      const result = await reconstructConversation(actionId);
      expect(result?.status).toBe('running');
    });
  });

  describe('captureConversation', () => {
    it('skips actions whose capture status is disabled or not_applicable', async () => {
      const disabled = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'disabled' });
      await seedCompletedConversationEvents(disabled);
      await expect(captureConversation(disabled)).resolves.toEqual({ status: 'skipped', reason: 'not_eligible' });

      const notApplicable = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'not_applicable' });
      await seedCompletedConversationEvents(notApplicable);
      await expect(captureConversation(notApplicable)).resolves.toEqual({ status: 'skipped', reason: 'not_eligible' });

      const disabledRow = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, disabled) });
      expect(disabledRow?.rawConversationPageId).toBeNull();
    });

    it('skips a pending action with no events yet', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
      await expect(captureConversation(actionId)).resolves.toEqual({ status: 'skipped', reason: 'no_content' });
    });

    it('creates a Raw Conversation page filed under the built-in Conversation category on first capture', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
      await seedCompletedConversationEvents(actionId, { question: 'What is the deployment topology?' });

      const outcome = await captureConversation(actionId);
      expect(outcome.status).toBe('captured');
      if (outcome.status !== 'captured') throw new Error('expected captured');

      const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, outcome.pageId) });
      expect(page).toMatchObject({ visibility: 'restricted', nature: 'original' });
      const category = await db.query.rawCategories.findFirst({ where: eq(schema.rawCategories.id, page!.rawCategoryId!) });
      expect(category?.systemKey).toBe('conversation');

      const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.pageId, outcome.pageId) });
      expect(revision).toMatchObject({ versionNumber: 1, status: 'published', actorKind: 'machine' });
      expect(revision?.contentSource).toContain('The wiki runs as a single Docker Compose stack.');

      const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
      expect(action).toMatchObject({ rawConversationPageId: outcome.pageId, rawConversationCaptureStatus: 'captured' });
      expect(action?.rawConversationLastEventId).toBeGreaterThan(0);
    });

    it('appends turns from the same web chat session to one Raw Conversation page', async () => {
      const sessionId = '00000000-0000-4000-8000-000000000026';
      const firstActionId = await createWikiQuestionAction(userId, {
        rawConversationCaptureStatus: 'pending',
        requestMetadata: { origin: 'web', webSessionId: sessionId },
      });
      await seedCompletedConversationEvents(firstActionId, {
        question: 'Summarize the MCP plan.',
        answer: 'The plan adds a governed tool runtime.',
      });
      const first = await captureConversation(firstActionId);
      expect(first.status).toBe('captured');
      if (first.status !== 'captured') throw new Error('expected captured');

      const secondActionId = await createWikiQuestionAction(userId, {
        rawConversationCaptureStatus: 'pending',
        requestMetadata: { origin: 'web', webSessionId: sessionId },
      });
      await seedCompletedConversationEvents(secondActionId, {
        question: 'Write the above into a standalone wiki page.',
        answer: 'Created a reviewed draft page.',
      });
      const second = await captureConversation(secondActionId);
      expect(second.status).toBe('captured');
      if (second.status !== 'captured') throw new Error('expected captured');
      expect(second.pageId).toBe(first.pageId);

      const actions = await db.query.aiActions.findMany({
        where: eq(schema.aiActions.rawConversationPageId, first.pageId),
      });
      expect(actions.map((action) => action.id).sort()).toEqual([firstActionId, secondActionId].sort());

      const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, first.pageId) });
      expect(page?.path).toMatch(new RegExp(`^conversations/wiki-ai/\\d{4}/\\d{2}/\\d{2}/${sessionId}$`));

      const revisions = await db.query.pageRevisions.findMany({ where: eq(schema.pageRevisions.pageId, first.pageId) });
      expect(revisions.map((revision) => revision.versionNumber).sort()).toEqual([1, 2]);
      const latest = revisions.find((revision) => revision.versionNumber === 2);
      expect(latest?.contentSource).toContain('## Turn 1');
      expect(latest?.contentSource).toContain('The plan adds a governed tool runtime.');
      expect(latest?.contentSource).toContain('## Turn 2');
      expect(latest?.contentSource).toContain('Created a reviewed draft page.');

      const snapshot = await getLatestConversationSnapshot(first.pageId);
      expect(snapshot?.turns).toHaveLength(2);
      expect(snapshot?.turns?.map((turn) => turn.answer)).toEqual([
        'The plan adds a governed tool runtime.',
        'Created a reviewed draft page.',
      ]);
    });

    it('captures tool-enabled wiki_question actions and records tool-call command markdown', async () => {
      const actionId = await createWikiQuestionAction(userId, {
        rawConversationCaptureStatus: 'pending',
        requestMetadata: { origin: 'web', webSessionId: '00000000-0000-4000-8000-000000000027' },
      });
      await appendConversationEvent(actionId, 'question', { text: 'Create a page from the prior answer.' });
      await appendConversationEvent(actionId, 'tool_call', {
        toolCallId: '00000000-0000-4000-8000-000000000028',
        toolName: 'create_page',
        status: 'succeeded',
        commandMarkdown: '```tool-call\ntool: create_page\n```',
      });
      await appendConversationEvent(actionId, 'text_delta', { text: 'Created a reviewed draft.' });
      await appendConversationEvent(actionId, 'completed', { status: 'completed' });

      const outcome = await captureConversation(actionId);
      expect(outcome.status).toBe('captured');
      if (outcome.status !== 'captured') throw new Error('expected captured');

      const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.pageId, outcome.pageId) });
      expect(revision?.contentSource).toContain('## Tool Calls');
      expect(revision?.contentSource).toContain('tool: create_page');
      const snapshot = await getLatestConversationSnapshot(outcome.pageId);
      expect(snapshot?.toolCalls).toEqual([
        expect.objectContaining({ toolName: 'create_page', status: 'succeeded' }),
      ]);
    });

    it('is idempotent: re-running with no new events is a no-op', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
      await seedCompletedConversationEvents(actionId);
      const first = await captureConversation(actionId);
      expect(first.status).toBe('captured');

      const second = await captureConversation(actionId);
      expect(second).toEqual({ status: 'skipped', reason: 'already_current' });

      const revisions = await db.query.pageRevisions.findMany({
        where: eq(schema.pageRevisions.pageId, (first as { pageId: string }).pageId),
      });
      expect(revisions).toHaveLength(1);
    });

    it('appends a new revision when new events arrive after the first capture', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
      await appendConversationEvent(actionId, 'question', { text: 'Running question' });
      await appendConversationEvent(actionId, 'status', { status: 'running' });
      const first = await captureConversation(actionId);
      expect(first.status).toBe('captured');

      await appendConversationEvent(actionId, 'text_delta', { text: 'Partial answer so far.' });
      await appendConversationEvent(actionId, 'completed', { status: 'completed' });
      await db.update(schema.aiActions).set({ status: 'completed' }).where(eq(schema.aiActions.id, actionId));
      const second = await captureConversation(actionId);
      expect(second.status).toBe('captured');
      expect((second as { pageId: string }).pageId).toBe((first as { pageId: string }).pageId);

      const revisions = await db.query.pageRevisions.findMany({
        where: eq(schema.pageRevisions.pageId, (first as { pageId: string }).pageId),
      });
      expect(revisions.map((r) => r.versionNumber).sort()).toEqual([1, 2]);
      const latest = revisions.find((r) => r.versionNumber === 2);
      expect(latest?.contentSource).toContain('Partial answer so far.');
    });

    it('duplicate concurrent capture calls converge on exactly one page', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
      await seedCompletedConversationEvents(actionId);

      const [a, b] = await Promise.all([captureConversation(actionId), captureConversation(actionId)]);
      const pageIds = new Set(
        [a, b].filter((o) => o.status === 'captured').map((o) => (o as { pageId: string }).pageId),
      );
      expect(pageIds.size).toBe(1);

      const pages = await db.query.pages.findMany({ where: eq(schema.pages.id, [...pageIds][0]!) });
      expect(pages).toHaveLength(1);
    });

    it('marks the action failed with a bounded diagnostic when the actor is missing', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending', actorUserId: null });
      await seedCompletedConversationEvents(actionId);

      const outcome = await captureConversation(actionId);
      expect(outcome.status).toBe('failed');

      const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
      expect(action?.rawConversationCaptureStatus).toBe('failed');
      expect(action?.rawConversationCaptureError).toBeTruthy();
    });
  });

  describe('getLatestConversationSnapshot (023, Raw page loader)', () => {
    it('returns the current published revision as a view model', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending', status: 'completed' });
      await seedCompletedConversationEvents(actionId, { question: 'What is the deployment topology?', answer: 'A single Docker Compose stack.' });
      const outcome = await captureConversation(actionId);
      expect(outcome.status).toBe('captured');
      if (outcome.status !== 'captured') throw new Error('expected captured');

      const snapshot = await getLatestConversationSnapshot(outcome.pageId);
      expect(snapshot).toMatchObject({
        status: 'completed',
        question: 'What is the deployment topology?',
        answer: 'A single Docker Compose stack.',
      });
    });

    it('returns null for a page with no revisions or an unknown id', async () => {
      const [emptyPage] = await db
        .insert(schema.pages)
        .values({
          spaceId: (await ensureRawSpaceForConversations()).id,
          slug: 'empty',
          path: `no-revision-${userId}`,
          title: 'Empty',
          authorId: userId,
          visibility: 'restricted',
        })
        .returning({ id: schema.pages.id });
      await expect(getLatestConversationSnapshot(emptyPage!.id)).resolves.toBeNull();
      await expect(getLatestConversationSnapshot('00000000-0000-4000-8000-000000000000')).resolves.toBeNull();
      await db.delete(schema.pages).where(eq(schema.pages.id, emptyPage!.id));
    });

    it('falls back to null when the stored source_metadata does not validate (invalid-metadata fallback)', async () => {
      const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
      await seedCompletedConversationEvents(actionId);
      const outcome = await captureConversation(actionId);
      if (outcome.status !== 'captured') throw new Error('expected captured');

      await db
        .update(schema.pageRevisions)
        .set({ sourceMetadata: { inputKind: 'chat-transcript', schemaVersion: 999 } })
        .where(eq(schema.pageRevisions.id, (await db.query.pages.findFirst({ where: eq(schema.pages.id, outcome.pageId) }))!.currentPublishedVersionId!));

      await expect(getLatestConversationSnapshot(outcome.pageId)).resolves.toBeNull();
    });
  });
});
