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
} from '../../../test/ai-fixtures';
import { runAiCleanup } from './ai-cleanup';

describe('AI cleanup (023 raw conversation preservation)', () => {
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
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.authorId, userId));
    await db.delete(schema.pages).where(eq(schema.pages.authorId, userId));
    await removeAiTestUser(userId);
  });

  it('runs a final capture pass and preserves the pointer before purging events for a completed action', async () => {
    const past = new Date(Date.now() - 60_000);
    const actionId = await createWikiQuestionAction(userId, {
      status: 'completed',
      rawConversationCaptureStatus: 'pending',
      expiresAt: past,
    });
    await appendConversationEvent(actionId, 'question', { text: 'Final question' });
    await appendConversationEvent(actionId, 'text_delta', { text: 'Final answer.' });
    await db
      .update(schema.aiActionEvents)
      .set({ expiresAt: past })
      .where(eq(schema.aiActionEvents.actionId, actionId));

    await runAiCleanup();

    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    expect(action?.status).toBe('expired');
    expect(action?.rawConversationCaptureStatus).toBe('captured');
    expect(action?.rawConversationPageId).toBeTruthy();

    const events = await db.query.aiActionEvents.findMany({ where: eq(schema.aiActionEvents.actionId, actionId) });
    expect(events).toHaveLength(0);

    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.pageId, action!.rawConversationPageId!),
    });
    expect(revision?.contentSource).toContain('Final answer.');
  });

  it('marks an orphaned (never-terminal) conversation expired and captures a final "expired" snapshot', async () => {
    const past = new Date(Date.now() - 60_000);
    const actionId = await createWikiQuestionAction(userId, {
      status: 'running',
      rawConversationCaptureStatus: 'pending',
      expiresAt: past,
    });
    await appendConversationEvent(actionId, 'question', { text: 'Orphaned question' });
    await db
      .update(schema.aiActionEvents)
      .set({ expiresAt: past })
      .where(eq(schema.aiActionEvents.actionId, actionId));

    await runAiCleanup();

    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    expect(action?.status).toBe('expired');
    expect(action?.rawConversationCaptureStatus).toBe('captured');

    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.pageId, action!.rawConversationPageId!),
    });
    const metadata = revision?.sourceMetadata as { conversationStatus?: string } | null;
    expect(metadata?.conversationStatus).toBe('expired');
  });

  it('does not touch actions whose capture status is disabled or not_applicable', async () => {
    const past = new Date(Date.now() - 60_000);
    const disabled = await createWikiQuestionAction(userId, {
      status: 'completed',
      rawConversationCaptureStatus: 'disabled',
      expiresAt: past,
    });
    await appendConversationEvent(disabled, 'question', { text: 'q' });
    await db.update(schema.aiActionEvents).set({ expiresAt: past }).where(eq(schema.aiActionEvents.actionId, disabled));

    await runAiCleanup();

    const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, disabled) });
    expect(action?.status).toBe('expired');
    expect(action?.rawConversationCaptureStatus).toBe('disabled');
    expect(action?.rawConversationPageId).toBeNull();
  });
});
