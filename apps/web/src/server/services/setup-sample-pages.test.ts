import { afterAll, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { Actor } from '@/server/permissions';
import {
  resetSetupOnboardingState,
  createAdminUser,
  readSetupProgress,
  findPageByPath,
} from '../../../test/setup-onboarding-fixtures';

const cache = vi.hoisted(() => ({
  invalidatePublicContentCache: vi.fn(),
  invalidateSiteShellCache: vi.fn(),
  shouldUseDataCache: () => false,
  PUBLIC_CONTENT_CACHE_TAG: 'public-content',
  SITE_SHELL_CACHE_TAG: 'site-shell',
}));
vi.mock('@/server/cache/public-cache', () => cache);

import * as samplePages from '@/server/services/setup-sample-pages';
import * as definitions from '@/server/services/setup-sample-page-definitions';
import * as pagesService from '@/server/services/pages';
import * as revisionsService from '@/server/services/revisions';

const adminActor = (userId: string): Actor => ({ kind: 'user', userId, role: 'admin' });

afterAll(async () => {
  await resetSetupOnboardingState();
  await closeDb();
});

async function openSetupAtSampleStep(): Promise<{ userId: string; actor: Actor }> {
  await resetSetupOnboardingState();
  const { userId } = await createAdminUser();
  await db.insert(schema.setupProgress).values({
    id: 'default',
    adminUserId: userId,
    accountStatus: 'created',
    currentStep: 'sample_pages',
    aiStatus: 'skipped',
  });
  return { userId, actor: adminActor(userId) };
}

async function publishedRevisions(path: string) {
  const page = await findPageByPath(path);
  if (!page) return [];
  return db
    .select()
    .from(schema.pageRevisions)
    .where(and(eq(schema.pageRevisions.pageId, page.id), eq(schema.pageRevisions.status, 'published')))
    .orderBy(asc(schema.pageRevisions.versionNumber));
}

describe('sample page definitions (US3)', () => {
  it('uses the canonical paths', () => {
    expect(definitions.SAMPLE_PAGE_PATHS).toEqual({
      welcome: 'welcome',
      markdownSyntax: 'help/markdown-syntax',
      mainFeatures: 'help/main-features',
    });
  });

  it('onboarding welcome links to both help pages', () => {
    expect(definitions.ONBOARDING_WELCOME_PAGE_SOURCE).toContain('](/help/markdown-syntax)');
    expect(definitions.ONBOARDING_WELCOME_PAGE_SOURCE).toContain('](/help/main-features)');
    expect(definitions.ONBOARDING_WELCOME_PAGE_SOURCE).toContain(definitions.ONBOARDING_LINKS_MARKER);
    expect(definitions.ONBOARDING_WELCOME_PAGE_SOURCE).toContain(definitions.SAMPLE_PAGE_MARKER);
  });

  it('markdown syntax guide covers the supported features', () => {
    const source = definitions.MARKDOWN_SYNTAX_PAGE_SOURCE;
    expect(source).toContain('## Headings');
    expect(source).toContain('**bold**');
    expect(source).toContain('- First item');
    expect(source).toContain('](/welcome)');
    expect(source).toContain('```ts');
    expect(source).toContain('| Syntax | Result |');
    expect(source).toContain('$a^2 + b^2 = c^2$');
    expect(source).toContain('```mermaid');
    expect(source).toContain('[Main Features Guide](/help/main-features)');
    expect(source).toContain(definitions.SAMPLE_PAGE_MARKER);
  });

  it('main features guide covers the core capabilities', () => {
    const source = definitions.MAIN_FEATURES_PAGE_SOURCE;
    for (const topic of [
      'Page authoring',
      'Revision history',
      'Navigation and search',
      'Wiki chat',
      'Semantic search',
      'Image generation',
      'Import and export',
      'Administration',
    ]) {
      expect(source).toContain(topic);
    }
    expect(source).toContain('](/help/markdown-syntax)');
    expect(source).toContain(definitions.SAMPLE_PAGE_MARKER);
  });
});

describe('sample page writer (US3)', () => {
  it('creates all three pages as published revisions attributed to the admin', async () => {
    const { actor, userId } = await openSetupAtSampleStep();
    const result = await samplePages.generateSamplePages(actor);

    expect(result.status).toBe('completed');
    expect(result.nextStep).toBe('summary');
    expect(result.pages).toHaveLength(3);
    for (const page of result.pages) {
      expect(page.status).toBe('created');
      expect(page.pageId).toBeDefined();
    }

    for (const path of ['welcome', 'help/markdown-syntax', 'help/main-features']) {
      const page = await findPageByPath(path);
      expect(page).toBeDefined();
      expect(page?.authorId).toBe(userId);
      expect(page?.currentPublishedVersionId).toBeTruthy();
      const published = await publishedRevisions(path);
      expect(published).toHaveLength(1);
      expect(published[0]!.authorId).toBe(userId);
      expect(published[0]!.publishedAt).toBeInstanceOf(Date);
      expect(published[0]!.contentHtml).toBeTruthy();
    }

    const progress = await readSetupProgress();
    expect(progress?.samplePagesStatus).toBe('completed');
    expect(progress?.currentStep).toBe('summary');
    expect(progress?.completedAt).toBeInstanceOf(Date);
  });

  it('is idempotent on retry: no duplicates, no new revisions', async () => {
    const progress = await readSetupProgress();
    const actor = adminActor(progress!.adminUserId!);
    const before = await db.select().from(schema.pageRevisions);

    const result = await samplePages.generateSamplePages(actor);
    expect(result.status).toBe('completed');
    for (const page of result.pages) {
      expect(page.status).toBe('skipped');
    }
    const after = await db.select().from(schema.pageRevisions);
    expect(after).toHaveLength(before.length);
  });

  it('enriches an existing welcome page with a new published revision', async () => {
    const { actor, userId } = await openSetupAtSampleStep();
    const ctx = { actor };
    await pagesService.create(ctx, {
      path: 'welcome',
      title: 'Welcome to next-wiki',
      contentSource: '# Welcome to next-wiki\n\nUser-authored welcome.\n',
    });
    await revisionsService.publish(ctx, { path: 'welcome', version: 1 });

    const result = await samplePages.generateSamplePages(actor);
    const welcome = result.pages.find((page) => page.path === 'welcome');
    expect(welcome?.status).toBe('updated');

    const published = await publishedRevisions('welcome');
    expect(published).toHaveLength(2);
    expect(published[1]!.contentSource).toContain('User-authored welcome.');
    expect(published[1]!.contentSource).toContain(definitions.ONBOARDING_LINKS_MARKER);
    expect(published[1]!.contentSource).toContain('](/help/markdown-syntax)');
    expect(published[1]!.authorId).toBe(userId);

    // Enriching again is a no-op.
    const again = await samplePages.generateSamplePages(actor);
    expect(again.pages.find((page) => page.path === 'welcome')?.status).toBe('skipped');
    expect(await publishedRevisions('welcome')).toHaveLength(2);
  });

  it('reports collisions on user-authored help pages without overwriting', async () => {
    const { actor } = await openSetupAtSampleStep();
    const ctx = { actor };
    await pagesService.create(ctx, {
      path: 'help/markdown-syntax',
      title: 'My own markdown notes',
      contentSource: '# My notes\n\nDo not touch.\n',
    });
    await revisionsService.publish(ctx, { path: 'help/markdown-syntax', version: 1 });

    const result = await samplePages.generateSamplePages(actor);
    expect(result.status).toBe('partial');
    expect(result.pages.find((page) => page.path === 'help/markdown-syntax')?.status).toBe('collision');
    expect(result.pages.find((page) => page.path === 'help/main-features')?.status).toBe('created');

    const page = await findPageByPath('help/markdown-syntax');
    const [current] = await publishedRevisions('help/markdown-syntax');
    expect(page?.title).toBe('My own markdown notes');
    expect(current?.contentSource).toContain('Do not touch.');

    const progress = await readSetupProgress();
    expect(progress?.samplePagesStatus).toBe('partial');
  });

  it('skip records the choice without creating pages', async () => {
    const { actor } = await openSetupAtSampleStep();
    const result = await samplePages.skipSamplePages(actor);
    expect(result.status).toBe('skipped');
    expect(result.nextStep).toBe('summary');
    expect(await findPageByPath('help/markdown-syntax')).toBeUndefined();
    expect(await findPageByPath('help/main-features')).toBeUndefined();

    const progress = await readSetupProgress();
    expect(progress?.samplePagesStatus).toBe('skipped');
    expect(progress?.currentStep).toBe('summary');
  });

  it('requires the setup admin', async () => {
    await expect(samplePages.generateSamplePages({ kind: 'anonymous' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(samplePages.skipSamplePages({ kind: 'anonymous' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires a writing-mode choice before sample pages', async () => {
    await resetSetupOnboardingState();
    const { userId } = await createAdminUser();
    await db.insert(schema.setupProgress).values({
      id: 'default',
      adminUserId: userId,
      accountStatus: 'created',
      currentStep: 'writing_mode',
      aiStatus: 'skipped',
    });

    await expect(samplePages.skipSamplePages(adminActor(userId))).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('sample page cache invalidation (US3)', () => {
  it('invalidates public content for every created or updated page', async () => {
    cache.invalidatePublicContentCache.mockClear();
    const { actor } = await openSetupAtSampleStep();
    await samplePages.generateSamplePages(actor);
    // One invalidation per published revision (welcome + 2 help pages).
    expect(cache.invalidatePublicContentCache).toHaveBeenCalledTimes(3);
  });

  it('does not invalidate when nothing is created (skip)', async () => {
    cache.invalidatePublicContentCache.mockClear();
    const { actor } = await openSetupAtSampleStep();
    await samplePages.skipSamplePages(actor);
    expect(cache.invalidatePublicContentCache).not.toHaveBeenCalled();
  });
});
