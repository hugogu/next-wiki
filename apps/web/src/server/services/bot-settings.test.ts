import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import {
  getBotGeneralSettings,
  readBotGeneralSettings,
  updateBotGeneralSettings,
} from './bot-settings';

describe('bot general settings', () => {
  let adminId: string;
  let readerId: string;

  beforeEach(async () => {
    await clearAiData();
    adminId = await createAiTestUser('admin');
    readerId = await createAiTestUser('reader');
  });

  afterEach(async () => {
    await removeAiTestUser(adminId);
    await removeAiTestUser(readerId);
  });

  it('uses the relevance threshold default when no settings row exists', async () => {
    await expect(getBotGeneralSettings()).resolves.toEqual({
      wikiQuestionMinRelevanceScore: 0.5,
      updatedAt: null,
    });
  });

  it('persists an admin-configured threshold without floating point drift', async () => {
    const ctx = buildUserCtx(adminId, 'admin');
    const updated = await updateBotGeneralSettings(ctx, { wikiQuestionMinRelevanceScore: 0.63 });
    expect(updated.wikiQuestionMinRelevanceScore).toBe(0.63);
    await expect(readBotGeneralSettings(ctx)).resolves.toMatchObject({ wikiQuestionMinRelevanceScore: 0.63 });
  });

  it('rejects non-admin reads and writes', async () => {
    const ctx = buildUserCtx(readerId, 'reader');
    await expect(readBotGeneralSettings(ctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(updateBotGeneralSettings(ctx, { wikiQuestionMinRelevanceScore: 0.4 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
