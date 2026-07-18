import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

const runtime = vi.hoisted(() => ({
  enqueue: vi.fn(),
  QUEUES: {
    transferExport: 'transfer-export',
    transferPreview: 'transfer-preview',
    transferSourceTest: 'transfer-source-test',
    transferImport: 'transfer-import',
  },
}));
vi.mock('@/server/jobs/runtime', () => runtime);

import * as transfers from '@/server/services/transfers';

describe('transfer retry', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
    runtime.enqueue.mockReset();
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('preserves generated OKF export options on retry', async () => {
    const { userId } = await createAdminUser();
    const [failed] = await db
      .insert(schema.transferRuns)
      .values({
        kind: 'site_export',
        actorUserId: userId,
        status: 'failed',
        options: { space: 'generated', format: 'okf' },
        expiresAt: new Date(Date.now() + 3_600_000),
      })
      .returning();

    const retried = await transfers.retry(buildUserCtx(userId, 'admin'), failed!.id);
    const row = await db.query.transferRuns.findFirst({ where: eq(schema.transferRuns.id, retried.id) });

    expect(row?.options).toEqual({ space: 'generated', format: 'okf' });
    expect(runtime.enqueue).toHaveBeenCalledWith('transfer-export', { runId: retried.id });
  });
});
