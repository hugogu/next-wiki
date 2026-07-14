import { and, eq } from 'drizzle-orm';
import type {
  HybridSearchBehaviorInput,
  HybridSearchQueryInput,
  HybridSearchSemanticState,
  SearchCapabilityId,
  SearchEngineRunState,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { getActorUserId, type PermCtx } from '@/server/permissions';
import { isTerminalRunState, type CapabilitySnapshot } from '@/server/services/search/types';

export type SearchRecordSummary = {
  keywordResultCount: number;
  semanticResultCount: number;
  resultCount: number;
  semanticState: HybridSearchSemanticState;
  semanticActionId?: string | null;
};

export type SearchEngineRunRow = typeof schema.searchEngineRuns.$inferSelect;

function ownsRecord(
  row: { actorUserId: string | null; sessionId: string },
  ctx: PermCtx,
  sessionId: string,
): boolean {
  const actorUserId = getActorUserId(ctx);
  return row.sessionId === sessionId && (actorUserId ? row.actorUserId === actorUserId : row.actorUserId === null);
}

export async function getOwnedSearchRecord(ctx: PermCtx, searchRecordId: string, searchSessionId: string) {
  const row = await db.query.searchRecords.findFirst({ where: eq(schema.searchRecords.id, searchRecordId) });
  if (!row || !ownsRecord(row, ctx, searchSessionId)) throw new DomainError('NOT_FOUND', 'Search record not found');
  return row;
}

/**
 * Creates one query record per client UUID. A retry must provide the same
 * owner, session, and normalized query. The capability snapshot is stored at
 * creation and never rewritten: a retry after a settings change keeps the
 * capability set the attempt was accepted with (FR-010).
 */
export async function getOrCreateSearchRecord(
  ctx: PermCtx,
  input: HybridSearchQueryInput,
  spaceId: string,
  summary: SearchRecordSummary,
  capabilitySnapshot?: CapabilitySnapshot,
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
    ...(capabilitySnapshot ? { capabilitySnapshot } : {}),
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

/**
 * Ensures one run row exists per enabled capability in the attempt snapshot.
 * The unique (search_record_id, capability_id) key makes concurrent retries
 * converge on a single run instead of duplicating asynchronous work.
 */
export async function ensureEngineRuns(
  searchRecordId: string,
  capabilitySnapshot: CapabilitySnapshot,
): Promise<SearchEngineRunRow[]> {
  const enabled = (Object.keys(capabilitySnapshot) as SearchCapabilityId[]).filter((id) => capabilitySnapshot[id]);
  if (enabled.length > 0) {
    await db.insert(schema.searchEngineRuns)
      .values(enabled.map((capabilityId) => ({ searchRecordId, capabilityId })))
      .onConflictDoNothing();
  }
  return getEngineRuns(searchRecordId);
}

export async function getEngineRuns(searchRecordId: string): Promise<SearchEngineRunRow[]> {
  return db.query.searchEngineRuns.findMany({
    where: eq(schema.searchEngineRuns.searchRecordId, searchRecordId),
  });
}

/**
 * Records a safe lifecycle transition for one capability run. Terminal states
 * set `completedAt`; only aggregate count, state, timing, and the opaque
 * continuation reference are ever persisted.
 */
export async function updateEngineRun(
  searchRecordId: string,
  capabilityId: SearchCapabilityId,
  patch: {
    state: SearchEngineRunState;
    resultCount?: number;
    continuationRef?: string | null;
  },
): Promise<void> {
  const now = new Date();
  await db.update(schema.searchEngineRuns)
    .set({
      state: patch.state,
      ...(patch.resultCount !== undefined ? { resultCount: patch.resultCount } : {}),
      ...(patch.continuationRef !== undefined ? { continuationRef: patch.continuationRef } : {}),
      completedAt: isTerminalRunState(patch.state) ? now : null,
      updatedAt: now,
    })
    .where(and(
      eq(schema.searchEngineRuns.searchRecordId, searchRecordId),
      eq(schema.searchEngineRuns.capabilityId, capabilityId),
    ));
}

export async function recordSearchBehavior(
  ctx: PermCtx,
  input: HybridSearchBehaviorInput,
): Promise<void> {
  if ((input.action === 'result_open' && !input.pageId) || (input.action === 'escape' && input.pageId)) {
    throw new DomainError('BAD_REQUEST', 'Invalid search behavior payload');
  }
  const record = await getOwnedSearchRecord(ctx, input.searchRecordId, input.searchSessionId);
  await db.insert(schema.searchBehaviors).values({
    id: input.eventId,
    searchRecordId: record.id,
    actorUserId: getActorUserId(ctx),
    action: input.action,
    pageId: input.pageId ?? null,
  }).onConflictDoNothing();
}
