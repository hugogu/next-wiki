import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import {
  clearAiData,
  createAiTestUser,
  createWikiQuestionAction,
  ensureRawSpaceForConversations,
  removeAiTestUser,
  seedCompletedConversationEvents,
} from '../../../test/ai-fixtures';
import { captureConversation } from './raw-conversations';

/**
 * 025: Feishu turns flow through the same `captureConversation` pipeline as
 * web turns. These tests prove the channel marker is inferred correctly from
 * `requestMetadata.origin`, capture is gated by eligibility the same way for
 * both channels, and capture stays idempotent for a Feishu-origin action.
 */
describe('raw conversations service — Feishu channel (025)', () => {
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

  it('stamps channel=feishu on a captured page when the action origin is feishu', async () => {
    const actionId = await createWikiQuestionAction(userId, {
      rawConversationCaptureStatus: 'pending',
      requestMetadata: { origin: 'feishu', feishuSessionId: 'session-1' },
    });
    await seedCompletedConversationEvents(actionId);

    const outcome = await captureConversation(actionId);
    expect(outcome).toMatchObject({ status: 'captured', channel: 'feishu' });
    if (outcome.status !== 'captured') throw new Error('expected captured');

    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.pageId, outcome.pageId) });
    expect(revision?.sourceMetadata).toMatchObject({ channel: 'feishu' });
  });

  it('stamps channel=wiki-ai when the action has no origin (web chat side pane)', async () => {
    const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
    await seedCompletedConversationEvents(actionId);

    const outcome = await captureConversation(actionId);
    expect(outcome).toMatchObject({ status: 'captured', channel: 'wiki-ai' });
    if (outcome.status !== 'captured') throw new Error('expected captured');

    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.pageId, outcome.pageId) });
    expect(revision?.sourceMetadata).toMatchObject({ channel: 'wiki-ai' });
  });

  it('stamps channel=wiki-ai for any other/unrecognized origin', async () => {
    const actionId = await createWikiQuestionAction(userId, {
      rawConversationCaptureStatus: 'pending',
      requestMetadata: { origin: 'web' },
    });
    await seedCompletedConversationEvents(actionId);

    const outcome = await captureConversation(actionId);
    expect(outcome).toMatchObject({ status: 'captured', channel: 'wiki-ai' });
  });

  it('skips capture for a Feishu-origin action when the data source is disabled — no Raw page is created', async () => {
    const actionId = await createWikiQuestionAction(userId, {
      rawConversationCaptureStatus: 'disabled',
      requestMetadata: { origin: 'feishu' },
    });
    await seedCompletedConversationEvents(actionId);

    await expect(captureConversation(actionId)).resolves.toEqual({ status: 'skipped', reason: 'not_eligible' });
    const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    expect(row?.rawConversationPageId).toBeNull();
  });

  it('is idempotent for a Feishu turn: capturing twice produces exactly one Raw page and a stable pointer', async () => {
    const actionId = await createWikiQuestionAction(userId, {
      rawConversationCaptureStatus: 'pending',
      requestMetadata: { origin: 'feishu' },
    });
    await seedCompletedConversationEvents(actionId);

    const first = await captureConversation(actionId);
    expect(first.status).toBe('captured');
    if (first.status !== 'captured') throw new Error('expected captured');

    const second = await captureConversation(actionId);
    expect(second).toEqual({ status: 'skipped', reason: 'already_current' });

    const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
    expect(row?.rawConversationPageId).toBe(first.pageId);
    const revisions = await db.query.pageRevisions.findMany({ where: eq(schema.pageRevisions.pageId, first.pageId) });
    expect(revisions).toHaveLength(1);
  });
});
