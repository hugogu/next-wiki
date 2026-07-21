import { and, desc, eq } from 'drizzle-orm';
import type { AiActionStatus, AiSearchResult, PublicSemanticSearchAction, PublicSemanticSearchStatus, PublicSemanticSearchSubmitInput } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, getActorUserId, spacePermissionOptions, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import type { FrontmatterFilters } from '@/server/transfers/frontmatter';
import { createSemanticSearch, type SemanticSearchInput } from './ai-retrieval';
import { resolveSpace } from '@/server/services/spaces';

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function extractFrontmatterFilters(input: PublicSemanticSearchSubmitInput): FrontmatterFilters | undefined {
  const filters: FrontmatterFilters = {
    tag: toArray(input.filterTag),
    status: toArray(input.filterStatus),
    owner: toArray(input.filterOwner),
    hasFrontmatter: input.filterHasFrontmatter,
  };
  const hasAnyFilter = filters.tag || filters.status || filters.owner || filters.hasFrontmatter !== undefined;
  return hasAnyFilter ? filters : undefined;
}

/**
 * Submitting requires BOTH `view` (page-read permission for result filtering)
 * and `ai.read` (AI retrieval capability) — checked here, before anything
 * about index state is touched, so a key missing either scope is rejected
 * with no disclosure of index readiness (FR-006/FR-007).
 *
 * 023: resolves the actual requested target space (e.g. `raw`) rather than
 * always the default wiki space, so a non-Admin submitting against Raw is
 * rejected up front with the correct space-aware permission (raw reads are
 * Admin-only) instead of an accepted-but-empty-results action. When `space`
 * is omitted this still resolves the default space, matching "search every
 * space the caller can read" — the per-candidate check in
 * `readPermissionFilteredVectorCandidates` is what actually widens results
 * across spaces in that case.
 */
async function requireSemanticSearchScope(ctx: PermCtx, spaceSlug?: string): Promise<void> {
  const space = await resolveSpace(spaceSlug);
  const canReadPages = can(
    ctx,
    'read',
    { kind: 'page_list' },
    space ? spacePermissionOptions(space) : { anonymousRead: false },
  );
  const canSearch = can(ctx, 'use_ai_search', { kind: 'ai_index' });
  if (!canReadPages || !canSearch) {
    throw new DomainError('FORBIDDEN', 'Semantic search requires both the view and ai.read scopes');
  }
}

export async function submitSemanticSearch(ctx: PermCtx, input: PublicSemanticSearchSubmitInput): Promise<PublicSemanticSearchAction> {
  await requireSemanticSearchScope(ctx, input.space);

  // `scope` mirrors the keyword endpoint's request shape for input-schema
  // parity (FR-004), but semantic matches are always over chunked content —
  // there is no path/title/content field to restrict, so it is accepted and
  // otherwise unused.
  const searchInput: SemanticSearchInput = {
    query: input.q,
    limit: input.limit,
    pathPrefix: input.pathPrefix,
    frontmatterFilters: extractFrontmatterFilters(input),
    space: input.space,
  };
  const accepted = await createSemanticSearch(ctx, searchInput);

  const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, accepted.id) });
  if (!row) throw new Error('Semantic search action was not persisted');

  return {
    id: row.id,
    feature: 'semantic_search',
    status: 'queued',
    createdAt: row.queuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    pollUrl: `/api/v1/search/semantic/${row.id}`,
  };
}

function mapStatus(row: { status: AiActionStatus; expiresAt: Date }): PublicSemanticSearchStatus {
  if (row.status === 'expired' || row.expiresAt.getTime() < Date.now()) return 'expired';
  if (row.status === 'completed') return 'succeeded';
  if (row.status === 'cancelled') return 'failed';
  return row.status;
}

function usageFrom(metadata: Record<string, unknown>): { inputTokens?: number; requestId?: string } | undefined {
  const inputTokens = typeof metadata.inputTokens === 'number' ? metadata.inputTokens : undefined;
  const requestId = typeof metadata.requestId === 'string' ? metadata.requestId : undefined;
  if (inputTokens === undefined && requestId === undefined) return undefined;
  return { inputTokens, requestId };
}

export async function getSemanticSearchResults(ctx: PermCtx, actionId: string): Promise<PublicSemanticSearchAction> {
  const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  const actorUserId = getActorUserId(ctx);
  // Existence non-disclosure: an action belonging to someone else looks
  // identical to one that never existed.
  if (!row || row.feature !== 'semantic_search' || !actorUserId || row.actorUserId !== actorUserId) {
    throw new DomainError('NOT_FOUND', 'Semantic search action not found');
  }

  const status = mapStatus(row);
  const base = {
    id: row.id,
    feature: 'semantic_search' as const,
    status,
    createdAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    pollUrl: `/api/v1/search/semantic/${row.id}`,
  };

  if (status === 'failed') {
    return {
      ...base,
      items: [],
      error: { code: row.errorCode ?? undefined, message: row.errorMessage ?? undefined },
    };
  }
  if (status !== 'succeeded') {
    return { ...base, items: [] };
  }

  const event = await db.query.aiActionEvents.findFirst({
    where: and(eq(schema.aiActionEvents.actionId, actionId), eq(schema.aiActionEvents.type, 'search_results')),
    orderBy: desc(schema.aiActionEvents.id),
  });
  const results = ((event?.payload as { results?: AiSearchResult[] } | undefined)?.results) ?? [];

  return {
    ...base,
    items: results.map((result) => ({
      pageId: result.pageId,
      path: result.path,
      title: result.title,
      score: result.score,
      excerpt: result.excerpt,
      citations: result.chunkId
        ? [{ chunkId: result.chunkId, revisionId: result.revisionId, contentHash: result.revisionHash }]
        : [],
    })),
    usage: usageFrom(row.usageMetadata as Record<string, unknown>),
  };
}
