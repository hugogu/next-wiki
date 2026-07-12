import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';

const streamText = vi.hoisted(() => vi.fn());
vi.mock('@/server/ai/registry', () => ({
  createAiProviderAdapter: () => ({ streamText }),
}));
vi.mock('@/server/services/ai-admin', async (original) => {
  const actual = await original<typeof import('@/server/services/ai-admin')>();
  return {
    ...actual,
    providerRuntime: vi.fn(async () => ({
      providerId: 'provider',
      name: 'Fixture',
      type: 'chat',
      vendor: 'custom',
      kind: 'openai_compatible',
      baseUrl: 'https://example.com',
      config: {},
      credentials: { apiKey: 'hidden' },
    })),
  };
});

import { runTranslationRun } from './translation';
import { getLiveTranslation } from '@/server/services/pages';
import { getStats } from '@/server/services/translations';

const SOURCE_MD = '# Hello\n\nWorld with a [link](/other).';
const sourceHash = createHash('sha256').update(SOURCE_MD).digest('hex');

async function reset() {
  await db.execute(
    sql.raw(`truncate table
      translation_revision_provenance, page_translation_states, translation_run_items,
      translation_runs, translation_prompt_versions, translation_prompt_templates,
      translation_languages, translation_groups,
      ai_model_capabilities, ai_models, ai_providers,
      spaces, users
    restart identity cascade`),
  );
}

type Seed = {
  adminId: string;
  spaceId: string;
  sourcePageId: string;
  sourceRevisionId: string;
  modelId: string;
  providerId: string;
};

async function seed(): Promise<Seed> {
  const adminId = randomUUID();
  await db.insert(schema.users).values({
    id: adminId,
    email: `admin-${adminId}@example.com`,
    passwordHash: 'x',
    role: 'admin',
  });
  const spaceId = randomUUID();
  await db.insert(schema.spaces).values({ id: spaceId, slug: 'default', name: 'Default' });
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
  const sourcePageId = randomUUID();
  const sourceRevisionId = randomUUID();
  await db.insert(schema.pages).values({
    id: sourcePageId,
    spaceId,
    slug: 'guide',
    path: 'guide',
    locale: 'en',
    title: 'Guide',
    authorId: adminId,
    currentPublishedVersionId: sourceRevisionId,
    latestVersionId: sourceRevisionId,
  });
  await db.insert(schema.pageRevisions).values({
    id: sourceRevisionId,
    pageId: sourcePageId,
    versionNumber: 1,
    contentSource: SOURCE_MD,
    contentHtml: '<h1>Hello</h1>',
    contentHash: sourceHash,
    authorId: adminId,
    status: 'published',
    publishedAt: new Date(),
  });
  await db.insert(schema.translationLanguages).values({ code: 'zh', enabled: true });
  return { adminId, spaceId, sourcePageId, sourceRevisionId, modelId: model!.id, providerId: provider!.id };
}

async function insertRun(s: Seed, sourceHashOverride?: string): Promise<{ runId: string; itemId: string }> {
  const [run] = await db
    .insert(schema.translationRuns)
    .values({
      targetLocale: 'zh',
      kind: 'initial',
      status: 'queued',
      providerId: s.providerId,
      modelId: s.modelId,
      modelExternalId: 'fixture/text',
      modelDisplayName: 'Fixture Text',
      activeLanguageSlot: 'zh',
      totalItems: 1,
      actorUserId: s.adminId,
    })
    .returning();
  const [item] = await db
    .insert(schema.translationRunItems)
    .values({
      runId: run!.id,
      sourcePageId: s.sourcePageId,
      sourceRevisionId: s.sourceRevisionId,
      sourceContentHash: sourceHashOverride ?? sourceHash,
      targetLocale: 'zh',
      targetPath: 'guide',
      providerId: s.providerId,
      modelId: s.modelId,
    })
    .returning();
  return { runId: run!.id, itemId: item!.id };
}

describe('translation worker', () => {
  beforeEach(async () => {
    await reset();
    streamText.mockReset();
    streamText.mockImplementation(async function* () {
      yield { type: 'delta', text: '# 你好\n\n带[链接](/other)的世界。' };
      yield { type: 'usage', inputTokens: 12, outputTokens: 6 };
    });
  });

  it('translates a source page into a published, readable translation with provenance', async () => {
    const s = await seed();
    const { runId, itemId } = await insertRun(s);

    await runTranslationRun(runId);

    const run = await db.query.translationRuns.findFirst({
      where: eq(schema.translationRuns.id, runId),
    });
    expect(run?.status).toBe('completed');
    expect(run?.completedItems).toBe(1);
    expect(run?.processedItems).toBe(1);
    // The active-language slot is released on completion.
    expect(run?.activeLanguageSlot).toBeNull();
    expect(run?.inputTokens).toBe(12);

    const item = await db.query.translationRunItems.findFirst({
      where: eq(schema.translationRunItems.id, itemId),
    });
    expect(item?.status).toBe('completed');
    expect(item?.translationRevisionId).toBeTruthy();
    expect(item?.usageSource).toBe('provider_reported');

    const translated = await db.query.pages.findFirst({
      where: and(eq(schema.pages.locale, 'zh'), isNotNull(schema.pages.translationGroupId)),
    });
    expect(translated?.path).toBe('guide');
    expect(translated?.sourcePageId).toBe(s.sourcePageId);
    expect(translated?.currentPublishedVersionId).toBeTruthy();

    const provenance = await db.query.translationRevisionProvenance.findFirst({
      where: eq(schema.translationRevisionProvenance.translationRevisionId, item!.translationRevisionId!),
    });
    expect(provenance?.sourceRevisionId).toBe(s.sourceRevisionId);
    expect(provenance?.modelDisplayName).toBe('Fixture Text');

    // Reader resolves the language-prefixed address to the translation.
    const read = await getLiveTranslation(buildUserCtx(s.adminId, 'admin'), 'zh', 'guide');
    expect(read.kind).toBe('page');
    if (read.kind === 'page') expect(read.page.contentHtml).toContain('你好');

    // Per-language stats count the distinct translated page as fresh.
    const stats = await getStats(buildUserCtx(s.adminId, 'admin'));
    expect(stats.totalSourcePages).toBe(1);
    expect(stats.totalTranslatedPages).toBe(1);
    const zh = stats.languages.find((l) => l.code === 'zh');
    expect(zh?.totalPages).toBe(1);
    expect(zh?.freshPages).toBe(1);
    expect(zh?.name).toBe('Chinese (Simplified)');
  });

  it('marks output superseded (never published) when the source changed mid-run', async () => {
    const s = await seed();
    // The item was snapshotted against a stale hash; the live source differs.
    const { runId, itemId } = await insertRun(s, 'stale-hash');

    await runTranslationRun(runId);

    const item = await db.query.translationRunItems.findFirst({
      where: eq(schema.translationRunItems.id, itemId),
    });
    expect(item?.status).toBe('superseded');
    const run = await db.query.translationRuns.findFirst({
      where: eq(schema.translationRuns.id, runId),
    });
    expect(run?.status).toBe('completed_with_warnings');
    expect(run?.supersededItems).toBe(1);
    // No translated page should have been published.
    const translated = await db.query.pages.findFirst({
      where: and(eq(schema.pages.locale, 'zh'), isNotNull(schema.pages.translationGroupId)),
    });
    expect(translated).toBeUndefined();
  });

  it('fails an item without aborting the run when the model returns empty output', async () => {
    streamText.mockImplementation(async function* () {
      yield { type: 'delta', text: '   ' };
    });
    const s = await seed();
    const { runId, itemId } = await insertRun(s);

    await runTranslationRun(runId);

    const item = await db.query.translationRunItems.findFirst({
      where: eq(schema.translationRunItems.id, itemId),
    });
    expect(item?.status).toBe('failed');
    expect(item?.errorCode).toBe('INVALID_RESPONSE');
    const run = await db.query.translationRuns.findFirst({
      where: eq(schema.translationRuns.id, runId),
    });
    expect(run?.status).toBe('failed');
    expect(run?.failedItems).toBe(1);
  });
});
