import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { createAction } from '@/server/services/ai-actions';
import { runAiAction } from './ai-actions';

describe('AI action worker', () => {
  it('fails closed while global AI is disabled without reading provider input', async () => {
    await clearAiData();
    const userId = await createAiTestUser('admin');
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
    const action = await createAction(buildUserCtx(userId, 'admin'), {
      feature: 'provider_test',
      input: { secret: 'private' },
    });
    await db.update(schema.aiSettings).set({ enabled: false }).where(eq(schema.aiSettings.id, 'default'));
    await runAiAction(action.id);
    const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, action.id) });
    expect(row?.status).toBe('failed');
    expect(row?.errorCode).toBe('AI_DISABLED');
    await removeAiTestUser(userId);
  });
});
