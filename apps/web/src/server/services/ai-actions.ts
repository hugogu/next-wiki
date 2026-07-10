import { and, asc, count, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import type {
  AiActionAccepted,
  AiActionEvent,
  AiActionFeature,
  AiActionStatus,
  AiActionView,
  AiEventType,
  AiQuestionMode,
  AiSessionSummary,
  AiUsageStatsView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { decryptAiJson, encryptAiJson, hashAiPayload } from '@/server/crypto/ai-encryption';
import { enqueue, QUEUES } from '@/server/jobs/runtime';

/**
 * Knowledge-index rebuilds go to a dedicated queue so a bulk import cannot
 * starve interactive AI actions (image generation, optimization, questions).
 */
export function queueForFeature(feature: AiActionFeature): string {
  return feature === 'index_rebuild' ? QUEUES.aiIndex : QUEUES.aiAction;
}

// A full rebuild embeds every published page and routinely runs 30–60+ minutes
// on modest wikis, far beyond pg-boss's 15-minute default expiry. Without this
// override the job expires mid-build, pg-boss retries it, and pages orphaned in
// `running` (the worker had marked them but died before completing) never get
// re-claimed — observed as a build stuck forever at e.g. 1391/1396. Interactive
// actions stay on the default short expiry.
export const indexRebuildExpireSeconds = 4 * 60 * 60;

export function expireSecondsForFeature(feature: AiActionFeature): number | undefined {
  return feature === 'index_rebuild' ? indexRebuildExpireSeconds : undefined;
}

type CreateActionInput = {
  feature: AiActionFeature;
  input?: unknown;
  providerId?: string | null;
  modelId?: string | null;
  indexGenerationId?: string | null;
  pageId?: string | null;
  questionMode?: AiQuestionMode | null;
  requestMetadata?: Record<string, unknown>;
  allowWhenDisabled?: boolean;
};

function expiry(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export async function getAiSettings() {
  return (
    (await db.query.aiSettings.findFirst({ where: eq(schema.aiSettings.id, 'default') })) ?? {
      id: 'default',
      enabled: false,
      eventRetentionHours: env.AI_EVENT_RETENTION_HOURS,
      artifactRetentionHours: env.AI_ARTIFACT_RETENTION_HOURS,
      modelDetectorApiKeyEncrypted: null,
      updatedBy: null,
      updatedAt: new Date(0),
    }
  );
}

export async function assertAiEnabled(): Promise<void> {
  if (!(await getAiSettings()).enabled) {
    throw new DomainError('AI_DISABLED', 'AI features are disabled');
  }
}

export async function createAction(ctx: PermCtx, input: CreateActionInput): Promise<AiActionAccepted> {
  // An api_key actor may reach here only for features whose `can()` gate
  // already passed (currently just 'search', via the new ai.read scope);
  // every other feature stays blocked upstream by the api-key hard-deny list
  // in permissions/index.ts, so accepting any authenticated actor with a
  // userId here does not widen what an api_key can actually do.
  const userId = getActorUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'A signed-in user session is required');
  }
  if (!input.allowWhenDisabled) await assertAiEnabled();
  const settings = await getAiSettings();
  const expiresAt = expiry(settings.eventRetentionHours);
  const created = await db.transaction(async (tx) => {
    const [action] = await tx
      .insert(schema.aiActions)
      .values({
        feature: input.feature,
        actorUserId: userId,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        indexGenerationId: input.indexGenerationId ?? null,
        pageId: input.pageId ?? null,
        questionMode: input.questionMode ?? null,
        requestMetadata: input.requestMetadata ?? {},
        expiresAt,
      })
      .returning({ id: schema.aiActions.id });
    if (input.input !== undefined) {
      await tx.insert(schema.aiActionInputs).values({
        actionId: action!.id,
        payloadEncrypted: encryptAiJson(input.input),
        payloadHash: hashAiPayload(input.input),
        expiresAt,
      });
    }
    await tx.insert(schema.aiActionEvents).values({
      actionId: action!.id,
      type: 'status',
      payload: { status: 'queued' },
      expiresAt,
    });
    return action!;
  });
  const expireSeconds = expireSecondsForFeature(input.feature);
  await enqueue(queueForFeature(input.feature), { actionId: created.id }, expireSeconds ? { expireInSeconds: expireSeconds } : undefined);
  return {
    id: created.id,
    feature: input.feature,
    status: 'queued',
    eventsUrl: `/api/ai/actions/${created.id}/events`,
  };
}

/**
 * Persist an already-finished action without enqueuing a worker job. Used for
 * synchronous operations (e.g. the connection test) so they still appear in the
 * run-record audit with their request/response and error detail.
 */
export async function recordTerminalAction(
  ctx: PermCtx,
  input: {
    feature: AiActionFeature;
    status: Extract<AiActionStatus, 'completed' | 'failed'>;
    providerId?: string | null;
    modelId?: string | null;
    requestMetadata?: Record<string, unknown>;
    resultMetadata?: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
    errorDetail?: string | null;
  },
): Promise<void> {
  const settings = await getAiSettings();
  const now = new Date();
  await db.insert(schema.aiActions).values({
    feature: input.feature,
    status: input.status,
    actorUserId: getActorUserId(ctx) ?? null,
    providerId: input.providerId ?? null,
    modelId: input.modelId ?? null,
    requestMetadata: input.requestMetadata ?? {},
    resultMetadata: input.resultMetadata ?? {},
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage?.slice(0, 500) ?? null,
    errorDetail: input.errorDetail?.slice(0, 8_000) ?? null,
    queuedAt: now,
    startedAt: now,
    finishedAt: now,
    expiresAt: expiry(settings.eventRetentionHours),
  });
}

export async function readActionInput<T>(actionId: string): Promise<T | null> {
  const row = await db.query.aiActionInputs.findFirst({
    where: and(
      eq(schema.aiActionInputs.actionId, actionId),
      gt(schema.aiActionInputs.expiresAt, new Date()),
    ),
  });
  return row ? decryptAiJson<T>(row.payloadEncrypted) : null;
}

export async function deleteActionInput(actionId: string): Promise<void> {
  await db.delete(schema.aiActionInputs).where(eq(schema.aiActionInputs.actionId, actionId));
}

export async function appendActionEvent(
  actionId: string,
  type: AiEventType,
  payload: Record<string, unknown>,
): Promise<number> {
  const settings = await getAiSettings();
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > 128 * 1024) {
    throw new DomainError('INVALID_RESPONSE', 'AI event payload is too large');
  }
  const [row] = await db
    .insert(schema.aiActionEvents)
    .values({ actionId, type, payload, expiresAt: expiry(settings.eventRetentionHours) })
    .returning({ id: schema.aiActionEvents.id });
  return row!.id;
}

export async function getActionEvents(
  ctx: PermCtx,
  actionId: string,
  after = 0,
  limit = 100,
): Promise<AiActionEvent[]> {
  await requireActionAccess(ctx, actionId);
  const rows = await db
    .select()
    .from(schema.aiActionEvents)
    .where(
      and(
        eq(schema.aiActionEvents.actionId, actionId),
        gt(schema.aiActionEvents.id, after),
        gt(schema.aiActionEvents.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(schema.aiActionEvents.id))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    actionId: row.actionId,
    type: row.type,
    payload: row.payload as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Fetches an action's entire event log, paging past `getActionEvents`'s
 * per-call limit — a single-shot fetch would silently truncate a long
 * streamed answer (and could drop the trailing `citations`/`completed`
 * events entirely), unlike the live SSE path which keeps polling until done.
 */
export async function getAllActionEvents(ctx: PermCtx, actionId: string, pageSize = 500): Promise<AiActionEvent[]> {
  const all: AiActionEvent[] = [];
  let after = 0;
  for (;;) {
    const page = await getActionEvents(ctx, actionId, after, pageSize);
    if (page.length === 0) break;
    all.push(...page);
    after = page[page.length - 1]!.id;
    if (page.length < pageSize) break;
  }
  return all;
}

export async function requireActionAccess(ctx: PermCtx, actionId: string) {
  const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  if (!row) throw new DomainError('NOT_FOUND', 'AI action not found');
  const actorUserId = getActorUserId(ctx);
  if (
    ctx.actor.kind !== 'user' ||
    (row.actorUserId !== actorUserId && !can(ctx, 'manage_ai', { kind: 'ai_settings' }))
  ) {
    throw new DomainError('NOT_FOUND', 'AI action not found');
  }
  return row;
}

async function toView(row: typeof schema.aiActions.$inferSelect): Promise<AiActionView> {
  const [provider, model, page] = await Promise.all([
    row.providerId
      ? db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, row.providerId) })
      : null,
    row.modelId ? db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, row.modelId) }) : null,
    row.pageId
      ? db.query.pages.findFirst({
          where: eq(schema.pages.id, row.pageId),
          columns: { path: true },
        })
      : null,
  ]);
  return {
    id: row.id,
    feature: row.feature,
    status: row.status,
    actorUserId: row.actorUserId,
    providerId: row.providerId,
    providerName: provider?.name ?? null,
    modelId: row.modelId,
    modelName: model?.displayName ?? null,
    indexGenerationId: row.indexGenerationId,
    pageId: row.pageId,
    pagePath: page?.path ?? null,
    questionMode: row.questionMode,
    requestMetadata: row.requestMetadata as Record<string, unknown>,
    resultMetadata: row.resultMetadata as Record<string, unknown>,
    usageMetadata: row.usageMetadata as Record<string, unknown>,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    errorDetail: row.errorDetail,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function getAction(ctx: PermCtx, actionId: string): Promise<AiActionView> {
  return toView(await requireActionAccess(ctx, actionId));
}

const USAGE_CATEGORY: Partial<Record<AiActionFeature, keyof AiUsageStatsView>> = {
  wiki_question: 'chat',
  text_optimization: 'chat',
  semantic_search: 'embedding',
  index_rebuild: 'embedding',
  image_generation: 'image',
};

export async function getUsageStats(ctx: PermCtx): Promise<AiUsageStatsView> {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view AI usage');
  }
  const token = (field: string) =>
    sql<number>`coalesce(sum((${schema.aiActions.usageMetadata} ->> ${field})::numeric), 0)`;
  const rows = await db
    .select({
      feature: schema.aiActions.feature,
      requests: count(),
      inputTokens: token('inputTokens'),
      outputTokens: token('outputTokens'),
      cachedInputTokens: token('cachedInputTokens'),
    })
    .from(schema.aiActions)
    .where(eq(schema.aiActions.status, 'completed'))
    .groupBy(schema.aiActions.feature);
  const empty = () => ({ requests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
  const stats: AiUsageStatsView = { chat: empty(), embedding: empty(), image: empty() };
  for (const row of rows) {
    const category = USAGE_CATEGORY[row.feature];
    if (!category) continue;
    const bucket = stats[category];
    bucket.requests += Number(row.requests);
    bucket.inputTokens += Number(row.inputTokens);
    bucket.outputTokens += Number(row.outputTokens);
    bucket.cachedInputTokens += Number(row.cachedInputTokens);
  }
  return stats;
}

export async function listActions(
  ctx: PermCtx,
  filters: {
    feature?: AiActionFeature;
    status?: AiActionStatus;
    providerId?: string;
    modelId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ items: AiActionView[]; total: number }> {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view AI actions');
  }
  const predicates = [];
  if (filters.feature) predicates.push(eq(schema.aiActions.feature, filters.feature));
  if (filters.status) predicates.push(eq(schema.aiActions.status, filters.status));
  if (filters.providerId) predicates.push(eq(schema.aiActions.providerId, filters.providerId));
  if (filters.modelId) predicates.push(eq(schema.aiActions.modelId, filters.modelId));
  const where = predicates.length ? and(...predicates) : undefined;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(schema.aiActions)
      .where(where)
      .orderBy(desc(schema.aiActions.queuedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.aiActions).where(where),
  ]);
  return { items: await Promise.all(rows.map(toView)), total: totals[0]?.value ?? 0 };
}

function requireSessionUserId(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('UNAUTHORIZED', 'Sign in to manage your AI sessions');
  }
  return ctx.actor.userId;
}

/**
 * Lists the signed-in user's own wiki_question sessions for the user-center
 * history panel — never other actors' sessions, regardless of role. Search
 * matches against the `question` event text (see runWikiQuestionAction),
 * which is retained for the same window as the rest of the conversation, so
 * a session past its retention window simply won't match a search term.
 */
export async function listUserSessions(
  ctx: PermCtx,
  filters: { search?: string; status?: AiActionStatus; limit?: number; offset?: number } = {},
): Promise<{ items: AiSessionSummary[]; total: number }> {
  const userId = requireSessionUserId(ctx);
  const predicates = [
    eq(schema.aiActions.actorUserId, userId),
    eq(schema.aiActions.feature, 'wiki_question' as const),
  ];
  if (filters.status) predicates.push(eq(schema.aiActions.status, filters.status));
  if (filters.search?.trim()) {
    predicates.push(
      sql`exists (
        select 1 from ${schema.aiActionEvents}
        where ${schema.aiActionEvents.actionId} = ${schema.aiActions.id}
          and ${schema.aiActionEvents.type} = 'question'
          and ${schema.aiActionEvents.payload} ->> 'text' ilike ${`%${filters.search.trim()}%`}
      )`,
    );
  }
  const where = and(...predicates);
  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(schema.aiActions)
      .where(where)
      .orderBy(desc(schema.aiActions.queuedAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(schema.aiActions).where(where),
  ]);
  const ids = rows.map((row) => row.id);
  const questionEvents = ids.length
    ? await db
        .select({ actionId: schema.aiActionEvents.actionId, payload: schema.aiActionEvents.payload })
        .from(schema.aiActionEvents)
        .where(and(inArray(schema.aiActionEvents.actionId, ids), eq(schema.aiActionEvents.type, 'question')))
    : [];
  const questionByAction = new Map(
    questionEvents.map((row) => [row.actionId, String((row.payload as Record<string, unknown>).text ?? '')]),
  );
  const items = await Promise.all(
    rows.map(async (row) => ({
      ...(await toView(row)),
      questionExcerpt: questionByAction.get(row.id)?.slice(0, 200) ?? null,
    })),
  );
  return { items, total: totals[0]?.value ?? 0 };
}

/** Hard-deletes a session (and its cascaded inputs/events) after an ownership check. */
export async function deleteSession(ctx: PermCtx, actionId: string): Promise<void> {
  const row = await requireActionAccess(ctx, actionId);
  if (row.feature !== 'wiki_question') throw new DomainError('NOT_FOUND', 'AI action not found');
  await db.delete(schema.aiActions).where(eq(schema.aiActions.id, actionId));
}

export async function requestActionCancellation(ctx: PermCtx, actionId: string): Promise<AiActionView> {
  const row = await requireActionAccess(ctx, actionId);
  if (!['queued', 'running'].includes(row.status)) {
    throw new DomainError('CONFLICT', 'AI action is not cancellable');
  }
  const [updated] = await db
    .update(schema.aiActions)
    .set({ cancelRequested: true })
    .where(eq(schema.aiActions.id, actionId))
    .returning();
  return toView(updated!);
}

export async function startAction(actionId: string) {
  const [row] = await db
    .update(schema.aiActions)
    .set({ status: 'running', startedAt: new Date() })
    .where(and(eq(schema.aiActions.id, actionId), eq(schema.aiActions.status, 'queued')))
    .returning();
  if (row) await appendActionEvent(actionId, 'status', { status: 'running' });
  return row ?? null;
}

export async function finishAction(
  actionId: string,
  status: Extract<AiActionStatus, 'completed' | 'failed' | 'cancelled'>,
  details: {
    resultMetadata?: Record<string, unknown>;
    usageMetadata?: Record<string, unknown>;
    errorCode?: string | null;
    errorMessage?: string | null;
    errorDetail?: string | null;
  } = {},
): Promise<void> {
  await db
    .update(schema.aiActions)
    .set({
      status,
      resultMetadata: details.resultMetadata ?? {},
      usageMetadata: details.usageMetadata ?? {},
      errorCode: details.errorCode ?? null,
      errorMessage: details.errorMessage?.slice(0, 500) ?? null,
      errorDetail: details.errorDetail?.slice(0, 8_000) ?? null,
      finishedAt: new Date(),
    })
    .where(eq(schema.aiActions.id, actionId));
  await appendActionEvent(
    actionId,
    status === 'completed' ? 'completed' : 'error',
    status === 'completed'
      ? { status }
      : { status, code: details.errorCode ?? status.toUpperCase(), message: details.errorMessage ?? status },
  );
  await deleteActionInput(actionId);
}

export async function isCancellationRequested(actionId: string): Promise<boolean> {
  const row = await db.query.aiActions.findFirst({ where: eq(schema.aiActions.id, actionId) });
  return !row || row.cancelRequested || row.status === 'cancelled';
}

export async function findRecoverableActionIds(): Promise<Array<{ id: string; feature: AiActionFeature }>> {
  const rows = await db
    .select({ id: schema.aiActions.id, feature: schema.aiActions.feature })
    .from(schema.aiActions)
    .where(
      and(
        inArray(schema.aiActions.status, ['queued', 'running']),
        gt(schema.aiActions.expiresAt, new Date()),
      ),
    );
  if (rows.length) {
    await db
      .update(schema.aiActions)
      .set({ status: 'queued', startedAt: null })
      .where(inArray(schema.aiActions.id, rows.map((row) => row.id)));
  }
  return rows;
}

export async function cleanupExpiredAiData(): Promise<void> {
  const now = new Date();
  const supersededCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await db.delete(schema.aiActionEvents).where(lt(schema.aiActionEvents.expiresAt, now));
  await db.delete(schema.aiActionInputs).where(lt(schema.aiActionInputs.expiresAt, now));
  await db
    .update(schema.aiActions)
    .set({ status: 'expired' })
    .where(and(lt(schema.aiActions.expiresAt, now), inArray(schema.aiActions.status, ['completed', 'failed', 'cancelled'])));
  await db
    .delete(schema.aiGeneratedArtifacts)
    .where(
      and(
        lt(schema.aiGeneratedArtifacts.expiresAt, now),
        isNull(schema.aiGeneratedArtifacts.promotedAssetId),
      ),
    );
  await db
    .delete(schema.aiIndexGenerations)
    .where(
      and(
        eq(schema.aiIndexGenerations.status, 'superseded'),
        lt(schema.aiIndexGenerations.finishedAt, supersededCutoff),
      ),
    );
}
