import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { clearAiData, createAiTestUser, removeAiTestUser } from '../../../test/ai-fixtures';
import { assertAiFeature, getMyEntitlements, updateUserEntitlements } from './ai-entitlements';

describe('AI user entitlements', () => {
  let adminId: string;
  let readerId: string;
  beforeEach(async () => {
    await clearAiData();
    adminId = await createAiTestUser('admin');
    readerId = await createAiTestUser('reader');
    await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
  });
  afterEach(async () => {
    await removeAiTestUser(readerId);
    await removeAiTestUser(adminId);
  });

  it('defaults absent rows to disabled and accepts Admin updates', async () => {
    expect((await getMyEntitlements(buildUserCtx(readerId, 'reader'))).questionAnsweringEnabled).toBe(false);
    await updateUserEntitlements(buildUserCtx(adminId, 'admin'), readerId, {
      questionAnsweringEnabled: true,
      textOptimizationEnabled: false,
      imageGenerationEnabled: false,
    });
    await expect(assertAiFeature(buildUserCtx(readerId, 'reader'), 'question')).resolves.toBeTruthy();
    await expect(assertAiFeature(buildUserCtx(readerId, 'reader'), 'text')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('defaults absent admin rows to enabled, but an explicit row still wins', async () => {
    const entitlements = await getMyEntitlements(buildUserCtx(adminId, 'admin'));
    expect(entitlements.questionAnsweringEnabled).toBe(true);
    expect(entitlements.textOptimizationEnabled).toBe(true);
    expect(entitlements.imageGenerationEnabled).toBe(true);

    // An explicit all-off row overrides the admin default.
    await updateUserEntitlements(buildUserCtx(adminId, 'admin'), adminId, {
      questionAnsweringEnabled: false,
      textOptimizationEnabled: false,
      imageGenerationEnabled: false,
    });
    const after = await getMyEntitlements(buildUserCtx(adminId, 'admin'));
    expect(after.questionAnsweringEnabled).toBe(false);
  });

  it('fails closed on global disable and disabled users', async () => {
    await db.update(schema.aiSettings).set({ enabled: false }).where(eq(schema.aiSettings.id, 'default'));
    await expect(assertAiFeature(buildUserCtx(readerId, 'reader'), 'question')).rejects.toMatchObject({ code: 'AI_DISABLED' });
    await db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, readerId));
    await expect(getMyEntitlements(buildUserCtx(readerId, 'reader'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
