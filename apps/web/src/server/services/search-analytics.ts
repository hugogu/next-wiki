import { eq } from 'drizzle-orm';
import type { HybridSearchBehaviorInput, HybridSearchQueryInput, HybridSearchSemanticState } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { getActorUserId, type PermCtx } from '@/server/permissions';

export type SearchRecordSummary = {
  keywordResultCount: number;
  semanticResultCount: number;
  resultCount: number;
  semanticState: HybridSearchSemanticState;
  semanticActionId?: string | null;
};

function ownsRecord(
  row: { actorUserId: string | null; sessionId: string },
  ctx: PermCtx,
  sessionId: string,
): boolean {
  const actorUserId = getActorUserId(ctx);
  return actorUserId ? row.actorUserId === actorUserId : row.actorUserId === null && row.sessionId === sessionId;
}

export async function getOwnedSearchRecord(ctx: PermCtx, searchRecordId: string, searchSessionId: string) {
  const row = await db.query.searchRecords.findFirst({ where: eq(schema.searchRecords.id, searchRecordId) });
  if (!row || !ownsRecord(row, ctx, searchSessionId)) throw new DomainError('NOT_FOUND', 'Search record not found');
  return row;
}

/** Creates one query record per client UUID. A retry must provide the same owner, session, and normalized query. */
export async function getOrCreateSearchRecord(
  ctx: PermCtx,
  input: HybridSearchQueryInput,
  spaceId: string,
  summary: SearchRecordSummary,
) {
  const existing = await db.query.searchRecords.findFirst({ where: eq(schema.searchRecords.id, input.searchRecordId) });
  if (existing) {
    if (!ownsRecord(existing, ctx, input.searchSessionId) || existing.query !== input.q.trim()) {
      throw new DomainError('CONFLICT', 'Search record ID cannot be reused for another search');
    }
    return existing;
  }

  await db.insert(schema.searchRecords).values({
    id: input.searchRecordId,
    spaceId,
    actorUserId: getActorUserId(ctx),
    sessionId: input.searchSessionId,
    query: input.q.trim(),
    ...summary,
    semanticActionId: summary.semanticActionId ?? null,
  }).onConflictDoNothing();

  return getOwnedSearchRecord(ctx, input.searchRecordId, input.searchSessionId);
}

export async function updateSearchRecord(
  searchRecordId: string,
  summary: SearchRecordSummary,
): Promise<void> {
  await db.update(schema.searchRecords).set({
    ...summary,
    semanticActionId: summary.semanticActionId ?? null,
    updatedAt: new Date(),
  }).where(eq(schema.searchRecords.id, searchRecordId));
}

export async function recordSearchBehavior(
  ctx: PermCtx,
  input: HybridSearchBehaviorInput,
): Promise<void> {
  const record = await getOwnedSearchRecord(ctx, input.searchRecordId, input.searchSessionId);
  await db.insert(schema.searchBehaviors).values({
    id: input.eventId,
    searchRecordId: record.id,
    actorUserId: getActorUserId(ctx),
    action: input.action,
    pageId: input.pageId ?? null,
  }).onConflictDoNothing();
}
