import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';

const runtime = vi.hoisted(() => ({
  enqueue: vi.fn(),
  getBoss: vi.fn(() => ({}) as unknown),
  QUEUES: { translation: 'translation' },
}));
vi.mock('@/server/jobs/runtime', () => runtime);

import { createRun, markRunTerminal } from '@/server/services/translations';

const MD = '# Hello\n\nWorld.';
const contentHash = createHash('sha256').update(MD).digest('hex');

type Seed = { adminId: string; modelId: string; pageA: string; pageB: string };

async function reset() {
  await db.execute(
    sql.raw(`truncate table
      translation_revision_provenance, page_translation_states, translation_run_items,
      translation_runs, translation_prompt_versions, translation_prompt_templates,
      translation_languages, translation_groups,
      ai_purpose_assignments, ai_model_capabilities, ai_models, ai_providers, ai_settings,
      spaces, users
    restart identity cascade`),
  );
}

async function seedPage(
  spaceId: string,
  authorId: string,
  path: string,
): Promise<string> {
  const pageId = randomUUID();
  const revisionId = randomUUID();
  await db.insert(schema.pages).values({
    id: pageId,
    spaceId,
    slug: path,
    path,
    locale: 'en',
    title: path,
    authorId,
    currentPublishedVersionId: revisionId,
    latestVersionId: revisionId,
  });
  await db.insert(schema.pageRevisions).values({
    id: revisionId,
    pageId,
    versionNumber: 1,
    contentSource: MD,
    contentHtml: '<h1>Hello</h1>',
    contentHash,
    authorId,
    status: 'published',
    publishedAt: new Date(),
  });
  return pageId;
}

async function seed(): Promise<Seed> {
  const adminId = randomUUID();
  await db
    .insert(schema.users)
    .values({ id: adminId, email: `admin-${adminId}@example.com`, passwordHash: 'x', role: 'admin' });
  const spaceId = randomUUID();
  await db.insert(schema.spaces).values({ id: spaceId, slug: 'default', name: 'Default' });
  await db.insert(schema.aiSettings).values({ id: 'default', enabled: true });
  const [provider] = await db
    .insert(schema.aiProviders)
    .values({
      name: 'Fixture',
      kind: 'openai_compatible',
      baseUrl: 'https://example.com',
      credentialsEncrypted: 'x',
      enabled: true,
    })
    .returning();
  const [model] = await db
    .insert(schema.aiModels)
    .values({
      providerId: provider!.id,
      externalId: 'fixture/text',
      displayName: 'Fixture Text',
      availability: 'available',
      inputModalities: ['text'],
      outputModalities: ['text'],
    })
    .returning();
  await db
    .insert(schema.translationLanguages)
    .values({ code: 'zh', enabled: true, defaultModelId: model!.id });
  return {
    adminId,
    modelId: model!.id,
    pageA: await seedPage(spaceId, adminId, 'guide'),
    pageB: await seedPage(spaceId, adminId, 'reference'),
  };
}

function ctx(adminId: string) {
  return buildUserCtx(adminId, 'admin');
}

async function itemStatuses(runId: string): Promise<string[]> {
  const rows = await db
    .select({ status: schema.translationRunItems.status })
    .from(schema.translationRunItems)
    .where(eq(schema.translationRunItems.runId, runId));
  return rows.map((r) => r.status);
}

describe('translation run creation', () => {
  beforeEach(async () => {
    await reset();
    runtime.enqueue.mockReset();
  });

  it('translates a page while another page of the same language is still in flight', async () => {
    const s = await seed();
    const first = await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'page_ids', pageIds: [s.pageA] },
      mode: 'all',
    });

    const second = await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'page_ids', pageIds: [s.pageB] },
      mode: 'all',
    });

    expect(second.status).toBe('queued');
    expect(second.id).not.toBe(first.id);
    // Neither page-scoped run claims the language, so both can be queued.
    const slots = await db
      .select({ slot: schema.translationRuns.activeLanguageSlot })
      .from(schema.translationRuns);
    expect(slots.every((row) => row.slot === null)).toBe(true);
  });

  it('refuses a page that already has unfinished work for that language', async () => {
    const s = await seed();
    await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'page_ids', pageIds: [s.pageA] },
      mode: 'all',
    });

    await expect(
      createRun(ctx(s.adminId), {
        targetLocale: 'zh',
        scope: { kind: 'page_ids', pageIds: [s.pageA] },
        mode: 'all',
      }),
    ).rejects.toMatchObject({ code: 'TRANSLATION_ALREADY_RUNNING' });
  });

  it('lets a language-wide run skip the pages another run already owns', async () => {
    const s = await seed();
    await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'page_ids', pageIds: [s.pageA] },
      mode: 'all',
    });

    const bulk = await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'all_published' },
      mode: 'all',
    });

    const pages = await db
      .select({ sourcePageId: schema.translationRunItems.sourcePageId })
      .from(schema.translationRunItems)
      .where(eq(schema.translationRunItems.runId, bulk.id));
    expect(pages.map((p) => p.sourcePageId)).toEqual([s.pageB]);
  });

  it('still allows only one language-wide run per language', async () => {
    const s = await seed();
    const bulk = await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'all_published' },
      mode: 'all',
    });
    const run = await db.query.translationRuns.findFirst({
      where: eq(schema.translationRuns.id, bulk.id),
    });
    expect(run?.activeLanguageSlot).toBe('zh');

    // Every page is taken by the first run, so the second is refused before it
    // reaches the language slot — with the language, not the page, at fault
    // once its items no longer overlap.
    await db
      .update(schema.translationRunItems)
      .set({ status: 'completed', finishedAt: new Date() })
      .where(eq(schema.translationRunItems.runId, bulk.id));

    await expect(
      createRun(ctx(s.adminId), {
        targetLocale: 'zh',
        scope: { kind: 'all_published' },
        mode: 'all',
      }),
    ).rejects.toMatchObject({ code: 'TRANSLATION_ALREADY_RUNNING' });
  });

  it('frees a page for retranslation when its run ends without finishing it', async () => {
    const s = await seed();
    const first = await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'page_ids', pageIds: [s.pageA] },
      mode: 'all',
    });

    // An aborted run loop leaves items behind; the terminal transition must
    // finalize them or the page stays locked forever.
    await markRunTerminal(first.id, 'failed', { errorCode: 'PROVIDER_UNAVAILABLE' });
    expect(await itemStatuses(first.id)).toEqual(['cancelled']);

    const second = await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'page_ids', pageIds: [s.pageA] },
      mode: 'all',
    });
    expect(second.status).toBe('queued');
  });

  it('does not leave the page locked when the run cannot be queued', async () => {
    const s = await seed();
    runtime.enqueue.mockRejectedValueOnce(new Error('queue down'));

    await expect(
      createRun(ctx(s.adminId), {
        targetLocale: 'zh',
        scope: { kind: 'page_ids', pageIds: [s.pageA] },
        mode: 'all',
      }),
    ).rejects.toMatchObject({ code: 'JOB_QUEUE_UNAVAILABLE' });

    const retried = await createRun(ctx(s.adminId), {
      targetLocale: 'zh',
      scope: { kind: 'page_ids', pageIds: [s.pageA] },
      mode: 'all',
    });
    expect(retried.status).toBe('queued');
  });

  it('rejects a target language that is not enabled', async () => {
    const s = await seed();
    await db
      .update(schema.translationLanguages)
      .set({ enabled: false })
      .where(eq(schema.translationLanguages.code, 'zh'));

    await expect(
      createRun(ctx(s.adminId), {
        targetLocale: 'zh',
        scope: { kind: 'page_ids', pageIds: [s.pageA] },
        mode: 'all',
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('keeps the database guard as the last word on a concurrent duplicate', async () => {
    const s = await seed();
    const [run] = await db
      .insert(schema.translationRuns)
      .values({ targetLocale: 'zh', status: 'queued', totalItems: 1, actorUserId: s.adminId })
      .returning();
    await db.insert(schema.translationRunItems).values({
      runId: run!.id,
      sourcePageId: s.pageA,
      targetLocale: 'zh',
      targetPath: 'guide',
    });

    const [other] = await db
      .insert(schema.translationRuns)
      .values({ targetLocale: 'zh', status: 'queued', totalItems: 1, actorUserId: s.adminId })
      .returning();
    await expect(
      db.insert(schema.translationRunItems).values({
        runId: other!.id,
        sourcePageId: s.pageA,
        targetLocale: 'zh',
        targetPath: 'guide',
      }),
    ).rejects.toMatchObject({ constraint_name: 'translation_run_items_active_page_unique' });

    // A finished item no longer holds the page.
    await db
      .update(schema.translationRunItems)
      .set({ status: 'completed' })
      .where(
        and(
          eq(schema.translationRunItems.runId, run!.id),
          inArray(schema.translationRunItems.status, ['pending']),
        ),
      );
    await expect(
      db.insert(schema.translationRunItems).values({
        runId: other!.id,
        sourcePageId: s.pageA,
        targetLocale: 'zh',
        targetPath: 'guide',
      }),
    ).resolves.toBeDefined();
  });
});
