import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import { rerenderPage } from '@/server/services/page-rerender';
import { resolveSpace } from '@/server/services/spaces';
import { renderPageMarkdown } from '@/server/services/wiki-links';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

const enqueuePublicPageWarmupMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/server/services/public-page-warmup', () => ({
  enqueuePublicPageWarmup: enqueuePublicPageWarmupMock,
}));

async function latestHtml(pageId: string): Promise<string> {
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
  const revision = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, page!.latestVersionId!),
  });
  return revision!.contentHtml ?? '';
}

/** A published translation of `sourcePageId`, as the translation writer stores one. */
async function publishTranslation(sourcePageId: string, locale: string, authorId: string): Promise<void> {
  const source = (await db.query.pages.findFirst({ where: eq(schema.pages.id, sourcePageId) }))!;
  const [group] = await db
    .insert(schema.translationGroups)
    .values({ sourcePageId })
    .returning({ id: schema.translationGroups.id });
  const [page] = await db
    .insert(schema.pages)
    .values({
      spaceId: source.spaceId,
      slug: source.slug,
      path: source.path,
      locale,
      title: source.title,
      authorId,
      nature: 'generated',
      translationGroupId: group!.id,
      sourcePageId,
    })
    .returning({ id: schema.pages.id });
  const revisionId = randomUUID();
  await db.insert(schema.pageRevisions).values({
    id: revisionId,
    pageId: page!.id,
    versionNumber: 1,
    locale,
    contentType: 'text/markdown',
    contentSource: '# 翻译\n',
    contentHtml: '<h1>翻译</h1>',
    contentHash: 'a'.repeat(64),
    authorId,
    status: 'published',
    publishedAt: new Date(),
    actorKind: 'machine',
  });
  await db
    .update(schema.pages)
    .set({ currentPublishedVersionId: revisionId, latestVersionId: revisionId })
    .where(eq(schema.pages.id, page!.id));
}

describe('wikilinks in a stored page render', () => {
  let ctx: ReturnType<typeof buildUserCtx>;
  let adminUserId: string;

  beforeEach(async () => {
    await resetSetupOnboardingState();
    const { userId } = await createAdminUser({ email: 'wikilink-admin@example.com' });
    adminUserId = userId;
    ctx = buildUserCtx(userId, 'admin');
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('resolves a partial target to the target page canonical URL', async () => {
    await pageService.create(ctx, {
      path: 'knowledge/ops/multi-registry',
      title: 'Multi registry',
      contentSource: '# Multi registry\n',
    });
    const source = await pageService.create(ctx, {
      path: 'knowledge/ops/docker-mirror',
      title: 'Docker mirror',
      contentSource: '- 补充: [[ops/multi-registry]] 描述为何需要双 registry 发布。\n',
    });

    expect(await latestHtml(source.pageId)).toContain(
      '<a href="/wiki/knowledge/ops/multi-registry">ops/multi-registry</a>',
    );
  });

  it('links an unresolved target inside the space, and resolves it on re-render once the page exists', async () => {
    const source = await pageService.create(ctx, {
      path: 'knowledge/ops/planned',
      title: 'Planned',
      contentSource: 'See [[ops/later|the follow-up]].\n',
    });
    expect(await latestHtml(source.pageId)).toContain(
      '<a href="/wiki/ops/later">the follow-up</a>',
    );

    await pageService.create(ctx, {
      path: 'knowledge/ops/later',
      title: 'Later',
      contentSource: '# Later\n',
    });
    await rerenderPage(ctx, source.pageId);

    expect(await latestHtml(source.pageId)).toContain(
      '<a href="/wiki/knowledge/ops/later">the follow-up</a>',
    );
  });

  it('keeps a translated reader in their locale, and falls back to the original otherwise', async () => {
    const translated = await pageService.create(ctx, {
      path: 'knowledge/ops/translated',
      title: 'Translated',
      contentSource: '# Translated\n',
    });
    await pageService.create(ctx, {
      path: 'knowledge/ops/untranslated',
      title: 'Untranslated',
      contentSource: '# Untranslated\n',
    });
    await publishTranslation(translated.pageId, 'zh', adminUserId);

    const space = (await resolveSpace())!;
    const { html } = await renderPageMarkdown(
      space,
      'See [[ops/translated]] and [[ops/untranslated]].\n',
      { locale: 'zh' },
    );

    expect(html).toContain('href="/wiki/zh/knowledge/ops/translated"');
    expect(html).toContain('href="/wiki/knowledge/ops/untranslated"');
  });
});
