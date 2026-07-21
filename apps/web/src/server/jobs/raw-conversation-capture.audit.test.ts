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
import { runRawConversationCapture } from './raw-conversation-capture';

/**
 * 025 (US6): end-to-end proof (no mocks) that a real capture writes an audit
 * entry with the correct origin and no sensitive content — complements the
 * mock-based assertions in raw-conversation-capture.test.ts. The audit
 * surface is what Admins actually query, so this exercises the real
 * `api_audit_entries` write path.
 */
describe('raw-conversation-capture — audit trail (025, US6)', () => {
  let userId: string;

  beforeEach(async () => {
    await clearAiData();
    await ensureRawSpaceForConversations();
    userId = await createAiTestUser('reader');
    await db.delete(schema.apiAuditEntries);
  });

  afterAll(async () => {
    await closeDb();
  });

  afterEach(async () => {
    await db.delete(schema.apiAuditEntries);
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.authorId, userId));
    await db.delete(schema.pages).where(eq(schema.pages.authorId, userId));
    await removeAiTestUser(userId);
  });

  it('records origin=feishu, the bound user id, and a correlation id with no raw question/answer/credential text', async () => {
    const question = 'What secret deployment credential rotates monthly?';
    const answer = 'The AWS access key is rotated by the ops team every 30 days.';
    const actionId = await createWikiQuestionAction(userId, {
      rawConversationCaptureStatus: 'pending',
      requestMetadata: { origin: 'feishu', correlationId: 'corr-audit-feishu' },
    });
    await seedCompletedConversationEvents(actionId, { question, answer });

    await runRawConversationCapture({ actionId });

    const entry = await db.query.apiAuditEntries.findFirst({ where: eq(schema.apiAuditEntries.userId, userId) });
    expect(entry).toMatchObject({
      origin: 'feishu',
      userId,
      externalCorrelationId: 'corr-audit-feishu',
      entryType: 'page',
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(question);
    expect(serialized).not.toContain(answer);
    expect(serialized).not.toMatch(/appSecret|apiKey/i);
  });

  it('records origin=web when the action has no Feishu origin', async () => {
    const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'pending' });
    await seedCompletedConversationEvents(actionId);

    await runRawConversationCapture({ actionId });

    const entry = await db.query.apiAuditEntries.findFirst({ where: eq(schema.apiAuditEntries.userId, userId) });
    expect(entry).toMatchObject({ origin: 'web', userId });
  });

  it('writes no audit entry when capture is skipped (disabled data source)', async () => {
    const actionId = await createWikiQuestionAction(userId, { rawConversationCaptureStatus: 'disabled' });
    await seedCompletedConversationEvents(actionId);

    await runRawConversationCapture({ actionId });

    const entry = await db.query.apiAuditEntries.findFirst({ where: eq(schema.apiAuditEntries.userId, userId) });
    expect(entry).toBeUndefined();
  });
});
