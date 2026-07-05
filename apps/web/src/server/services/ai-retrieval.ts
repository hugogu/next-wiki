import { eq } from 'drizzle-orm';
import type { AiSearchResult } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import type { PermCtx } from '@/server/permissions';
import { buildUserCtx, can } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { exactCosineSearch, type VectorMatch } from '@/server/ai/retrieval/vector-search';
import { parsePageFrontmatter, matchesFrontmatterFilters, type FrontmatterFilters } from '@/server/transfers/frontmatter';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { providerRuntime } from './ai-admin';
import { assertAiFeature } from './ai-entitlements';
import { createAction, readActionInput, appendActionEvent, finishAction } from './ai-actions';

const DEFAULT_SPACE_SLUG = 'default';

async function getDefaultSpace() {
  return db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
}

export type SemanticSearchInput = {
  query: string;
  limit: number;
  pathPrefix?: string;
  frontmatterFilters?: FrontmatterFilters;
};

export async function createSemanticSearch(ctx: PermCtx, input: SemanticSearchInput) {
  await assertAiFeature(ctx, 'search');
  const generation = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.isActive, true) });
  if (!generation || generation.status !== 'ready') throw new DomainError('INDEX_NOT_READY', 'Semantic index is not ready');
  const model = await db
    .select({ model: schema.aiModels, provider: schema.aiProviders })
    .from(schema.aiModels)
    .innerJoin(schema.aiProviders, eq(schema.aiModels.providerId, schema.aiProviders.id))
    .where(eq(schema.aiModels.id, generation.modelId))
    .limit(1);
  if (!model[0]) throw new DomainError('AI_NOT_CONFIGURED', 'Embedding model is unavailable');
  return createAction(ctx, {
    feature: 'semantic_search',
    input,
    providerId: model[0].provider.id,
    modelId: model[0].model.id,
    indexGenerationId: generation.id,
    requestMetadata: { queryBytes: Buffer.byteLength(input.query), limit: input.limit },
  });
}

function matchesPathPrefix(path: string, pathPrefix: string | undefined): boolean {
  if (!pathPrefix) return true;
  return path === pathPrefix || path.startsWith(`${pathPrefix}/`);
}

export async function retrieve(
  ctx: PermCtx,
  generationId: string,
  queryVector: number[],
  limit: number,
  filters?: { pathPrefix?: string; frontmatter?: FrontmatterFilters },
): Promise<AiSearchResult[]> {
  const space = await getDefaultSpace();
  const matches = await exactCosineSearch(generationId, queryVector, Math.max(limit * 10, 100));
  const canReadPages = can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space?.anonymousRead ?? false });
  const readable = canReadPages ? matches : [];
  const chunksByPage = new Map<string, VectorMatch[]>();
  for (const match of readable) {
    if (!matchesPathPrefix(match.path, filters?.pathPrefix)) continue;
    const group = chunksByPage.get(match.pageId) ?? [];
    group.push(match);
    chunksByPage.set(match.pageId, group);
  }
  const grouped = [...chunksByPage.entries()].map(([pageId, pageMatches]) => {
    const best = pageMatches.sort((a, b) => b.score - a.score)[0]!;
    const combinedExcerpt = pageMatches
      .slice(0, 3)
      .map((m) => m.contentText)
      .join('\n\n')
      .slice(0, 1200);
    return {
      pageId,
      title: best.title,
      path: best.path,
      locale: best.locale,
      revisionId: best.revisionId,
      revisionHash: best.contentHash,
      chunkId: best.chunkId,
      excerpt: combinedExcerpt,
      score: best.score,
    };
  });

  if (!filters?.frontmatter) {
    return grouped.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // Frontmatter filters need the page's Markdown source, which isn't part of
  // the chunk-level vector match — read it per surviving candidate (bounded
  // by the over-fetch multiplier above, never the whole index).
  const withFrontmatter = await Promise.all(
    grouped.map(async (result) => {
      const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, result.revisionId) });
      const content = revision ? await readMarkdownFromDatabase(revision) : '';
      const { frontmatter } = parsePageFrontmatter(content ?? '');
      return { result, frontmatter };
    }),
  );
  return withFrontmatter
    .filter(({ frontmatter }) => matchesFrontmatterFilters(frontmatter, filters.frontmatter!))
    .map(({ result }) => result)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function runSemanticSearchAction(actionId: string): Promise<void> {
  const input = await readActionInput<SemanticSearchInput>(actionId);
  const action = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!input || !action?.modelId || !action.providerId || !action.indexGenerationId) throw new Error('Semantic search input expired');
  const model = await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, action.modelId) });
  const generation = await db.query.aiIndexGenerations.findFirst({ where: eq(schema.aiIndexGenerations.id, action.indexGenerationId) });
  if (!model || !generation) throw new Error('Semantic search model or index is unavailable');
  if (!action.actorUserId) throw new Error('Semantic search action is missing an actor');
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, action.actorUserId) });
  if (!user) throw new Error('Semantic search actor is no longer available');
  const ctx = buildUserCtx(user.id, user.role);
  const output = await createAiProviderAdapter(await providerRuntime(action.providerId)).embed({
    actionId,
    modelExternalId: model.externalId,
    inputs: [input.query],
    expectedDimensions: generation.embeddingDimensions,
    abortSignal: new AbortController().signal,
  });
  const results = await retrieve(ctx, generation.id, output.vectors[0]!, input.limit, {
    pathPrefix: input.pathPrefix,
    frontmatter: input.frontmatterFilters,
  });
  await appendActionEvent(actionId, 'search_results', { results });
  await finishAction(actionId, 'completed', { resultMetadata: { resultCount: results.length }, usageMetadata: output.usage ?? {} });
}
