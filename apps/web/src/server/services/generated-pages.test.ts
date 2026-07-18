import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as publicContent from '@/server/services/public-content';
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

  it('defaults API-key creation to generated in LLM Wiki mode and projects provenance', async () => {
    const { userId } = await createAdminUser();
    const apiCtx = buildApiKeyCtx(userId, 'admin', ['create', 'view'], 'generated-api-key');
    const sessionCtx = buildUserCtx(userId, 'admin');

    const created = await publicContent.createPage(apiCtx, {
      path: 'concepts/api-created', title: 'API created', contentSource: '# API created',
    }, ['latestRevision']);
    expect(created.spaceSlug).toBe('generated');
    expect(created.origin).toEqual({ actorKind: 'machine', nature: 'generated' });
    expect(created.humanModified).toBe(false);
    expect(created.visibility).toBe('restricted');

    const drafted = await pageService.newDraft(sessionCtx, 'concepts/api-created', {
      title: 'API created', contentSource: '# Updated by a human', baseRevisionId: created.latestRevision?.id,
    }, 'generated');
    const page = await publicContent.getPageById(sessionCtx, created.id);
    const firstRevision = await publicContent.getRevision(sessionCtx, created.id, 1);
    const secondRevision = await publicContent.getRevision(sessionCtx, created.id, drafted.versionNumber);

    expect(page?.origin).toEqual({ actorKind: 'machine', nature: 'generated' });
    expect(page?.humanModified).toBe(true);
    expect(firstRevision?.origin).toEqual({ actorKind: 'machine', nature: 'generated' });
    expect(secondRevision?.origin).toEqual({ actorKind: 'human', nature: 'generated' });
  });

  it('keeps API-key creation in the default space in Copilot mode', async () => {
    const { userId } = await createAdminUser();
    await setModeInternal('copilot', userId);

    const created = await publicContent.createPage(
      buildApiKeyCtx(userId, 'admin', ['create', 'view'], 'copilot-api-key'),
      { path: 'api/default', title: 'Default', contentSource: '# Default' },
    );

    expect(created.spaceSlug).toBe('default');
  });
});
