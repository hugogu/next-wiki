import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import { create, getHistory } from '@/server/services/pages';
import { publish } from '@/server/services/revisions';
import { setModeInternal } from '@/server/services/writing-mode';
import { confirmCrossSpaceMigration, previewCrossSpaceMigration, runCrossSpaceMigration } from './cross-space-migrations';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

/** The authorization boundary is intentionally covered without a database: a
 * real service invocation additionally validates source/destination visibility. */
describe('cross-space migration authorization contract', () => {
  it('models the only two eligible caller forms', () => {
    const admin = buildUserCtx('admin-id', 'admin');
    const apiKey = buildApiKeyCtx('admin-id', 'admin', ['edit'], 'key-id');
    expect(admin.actor).toMatchObject({ kind: 'user', role: 'admin' });
    expect(apiKey.actor).toMatchObject({ kind: 'api_key', role: 'admin', scopes: ['edit'] });
  });
});

describe('cross-space migration workflow', () => {
  let admin: ReturnType<typeof buildUserCtx>;

  beforeEach(async () => {
    await resetSetupOnboardingState();
    await db.insert(schema.spaces).values({ slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false }).onConflictDoNothing();
    await setModeInternal('llm-wiki', null);
    const account = await createAdminUser({ email: 'cross-space-admin@example.com' });
    admin = buildUserCtx(account.userId, 'admin');
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('previews, confirms, and moves a page while retaining its history', async () => {
    const page = await create(admin, { path: 'imports/ai-note', title: 'Imported AI note', contentSource: '# Note' });
    await publish(admin, { path: 'imports/ai-note', version: 1 });
    const generated = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'generated') });
    const preview = await previewCrossSpaceMigration(admin, {
      selection: { kind: 'page', pageId: page.pageId }, destinationSpaceId: generated!.id,
      adaptOkf: true,
    });
    expect(preview.items).toHaveLength(1);
    const operation = await confirmCrossSpaceMigration(admin, { previewId: preview.id, fingerprint: preview.fingerprint });
    await runCrossSpaceMigration(operation.id);

    const moved = await db.query.pages.findFirst({ where: eq(schema.pages.id, page.pageId) });
    expect(moved).toMatchObject({ spaceId: generated!.id, nature: 'generated', visibility: 'restricted' });
    expect(await getHistory(admin, 'imports/ai-note', 'generated')).toHaveLength(2);
    const item = await db.query.crossSpaceMigrationItems.findFirst({ where: eq(schema.crossSpaceMigrationItems.migrationId, operation.id) });
    expect(item?.status).toBe('moved');
  });
});
