import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import { setModeInternal } from '@/server/services/writing-mode';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

async function ensureGeneratedSpace() {
  await db
    .insert(schema.spaces)
    .values({ slug: 'generated', name: 'Generated', kind: 'generated', anonymousRead: false })
    .onConflictDoNothing();
}

async function ensureRawSpace() {
  await db
    .insert(schema.spaces)
    .values({ slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false })
    .onConflictDoNothing();
}

describe('generated page service', () => {
  beforeEach(async () => {
    await resetSetupOnboardingState();
    await ensureGeneratedSpace();
    await ensureRawSpace();
    await setModeInternal('llm-wiki', null);
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('injects OKF frontmatter on generated creates and drafts', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    const created = await pageService.create(ctx, {
      path: 'concepts/payments', title: 'Payments', contentSource: '# Payments',
    }, 'generated');
    const first = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, created.versionId) });
    expect(first?.contentSource).toMatch(/^---\ntype: Note\ntitle: Payments\ntimestamp: .+/);
    expect(first?.contentSource).toContain('\n---\n\n# Payments');

    const drafted = await pageService.newDraft(ctx, 'concepts/payments', {
      title: 'Payments', contentSource: '# Updated payments', baseRevisionId: created.versionId,
    }, 'generated');
    const second = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, drafted.versionId) });
    expect(second?.contentSource).toContain('type: Note');
    expect(second?.contentSource).toContain('# Updated payments');
  });

  it('preserves valid generated frontmatter exactly', async () => {
    const { userId } = await createAdminUser();
    const source = '---\ntype: Service\nowner: platform\ncustom:\n  nested: true\n---\n\n# Payments';
    const created = await pageService.create(buildUserCtx(userId, 'admin'), {
      path: 'concepts/service', title: 'Service', contentSource: source,
    }, 'generated');
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, created.versionId) });
    expect(revision?.contentSource).toBe(source);
  });

  it('rejects invalid generated sources and reserved concept paths', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');

    await expect(pageService.create(ctx, {
      path: 'concepts/missing-type', title: 'Missing', contentSource: '---\ntitle: Missing\n---\n\n# Missing',
    }, 'generated')).rejects.toMatchObject({ code: 'OKF_TYPE_REQUIRED' });
    await expect(pageService.create(ctx, {
      path: 'concepts/index', title: 'Index', contentSource: '# Index',
    }, 'generated')).rejects.toMatchObject({ code: 'OKF_RESERVED_PATH' });

    const created = await pageService.create(ctx, {
      path: 'concepts/changeable', title: 'Changeable', contentSource: '# Changeable',
    }, 'generated');
    await expect(pageService.updateProperties(ctx, 'concepts/changeable', {
      path: 'concepts/log', baseRevisionId: created.versionId,
    }, 'generated')).rejects.toMatchObject({ code: 'OKF_RESERVED_PATH' });
  });

  it('blocks direct raw creation and generated writes in Copilot mode', async () => {
    const { userId } = await createAdminUser();
    const ctx = buildUserCtx(userId, 'admin');
    await expect(pageService.create(ctx, {
      path: 'raw/direct', title: 'Direct', contentSource: 'Disallowed',
    }, 'raw')).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });

    await setModeInternal('copilot', userId);
    await expect(pageService.create(ctx, {
      path: 'concepts/copilot', title: 'Copilot', contentSource: '# Copilot',
    }, 'generated')).rejects.toMatchObject({ code: 'SPACE_UNAVAILABLE' });
  });
});
