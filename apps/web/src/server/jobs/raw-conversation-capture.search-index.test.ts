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
import { captureConversation } from '@/server/services/raw-conversations';

/**
 * 025 (US4): a captured Feishu turn must be reconciled into the search
 * indexes exactly the same way a captured web turn is — `captureConversation`
 * calls `reconcilePageAcrossIndexes` unconditionally, with no channel branch
 * (plan.md D6). This proves the durable "needs (re)indexing" marker
 * (`ai_page_index_states`) is written for a Feishu-origin capture.
 */
describe('raw-conversation-capture — search index reconciliation for Feishu captures (025)', () => {
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
    // aiPageIndexStates FK-references page_revisions, so it must be cleared
    // first (clearAiData's truncate set does not cover it).
    await db.delete(schema.aiPageIndexStates);
    await db.delete(schema.aiIndexGenerations);
    await db.delete(schema.aiModels);
    await db.delete(schema.aiProviders);
    await db.delete(schema.pageRevisions).where(eq(schema.pageRevisions.authorId, userId));
    await db.delete(schema.pages).where(eq(schema.pages.authorId, userId));
    await removeAiTestUser(userId);
  });

  it('writes a pending ai_page_index_states row for the captured page of a Feishu-origin turn', async () => {
    const [provider] = await db
      .insert(schema.aiProviders)
      .values({
        name: `feishu-capture-index-provider-${userId}`,
        kind: 'openai_compatible',
        baseUrl: 'https://example.com',
        credentialsEncrypted: 'x',
        status: 'healthy',
      })
      .returning();
    const [model] = await db
      .insert(schema.aiModels)
      .values({ providerId: provider!.id, externalId: 'embed', displayName: 'Embed', embeddingDimensions: 3 })
      .returning();
    const [generation] = await db
      .insert(schema.aiIndexGenerations)
      .values({ modelId: model!.id, embeddingDimensions: 3, chunkerVersion: 'test', status: 'ready', isActive: true })
      .returning();

    const actionId = await createWikiQuestionAction(userId, {
      rawConversationCaptureStatus: 'pending',
      requestMetadata: { origin: 'feishu' },
    });
    await seedCompletedConversationEvents(actionId);

    const outcome = await captureConversation(actionId);
    expect(outcome).toMatchObject({ status: 'captured', channel: 'feishu' });
    if (outcome.status !== 'captured') throw new Error('expected captured');

    const indexState = await db.query.aiPageIndexStates.findFirst({
      where: eq(schema.aiPageIndexStates.pageId, outcome.pageId),
    });
    expect(indexState).toMatchObject({ generationId: generation!.id, status: 'pending' });
  });
});
