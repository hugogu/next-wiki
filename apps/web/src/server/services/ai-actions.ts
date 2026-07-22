import { and, asc, count, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  rawConversationSourceMetadataSchema,
  type AiActionAccepted,
  type AiActionAdminView,
  type AiActionEvent,
  type AiActionFeature,
  type AiActionStatus,
  type AiActionView,
  type AiEventType,
  type AiQuestionMode,
  type AiSessionSummary,
  type AiUsageStatsView,
  type RawConversationCaptureStatus,
  type RawConversationPointer,
  type WikiAiChannel,
  type AiToolCallEventPayload,
  type AiToolProposalEventPayload,
  type AiToolEvidenceEventPayload,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { decryptAiJson, encryptAiJson, hashAiPayload } from '@/server/crypto/ai-encryption';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { logger } from '@/server/logger';

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
  /**
   * pg-boss job priority (higher runs first). Lets a user-triggered full index
   * rebuild jump ahead of a backlog of low-priority incremental reconcile jobs
   * instead of waiting behind them at the queue's modest fetch rate.
   */
  priority?: number;
  /**
   * 023/025: initial Raw Conversation capture eligibility, decided once at
   * create time from the AI Conversations data-source setting. `pending` means
   * capture is eligible once events arrive; `disabled` means this action was
   * created while the source was off and will never be captured. Actions for
   * every other feature stay `not_applicable` (the column default).
   */
  rawConversationCaptureStatus?: 'pending' | 'disabled';
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
      cloudflareDetectorEnabled: false,
      cloudflareAccountId: null,
      cloudflareApiTokenEncrypted: null,
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
        ...(input.rawConversationCaptureStatus
          ? { rawConversationCaptureStatus: input.rawConversationCaptureStatus }
          : {}),
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
  await enqueue(queueForFeature(input.feature), { actionId: created.id }, {
    ...(expireSeconds ? { expireInSeconds: expireSeconds } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
  });
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

/**
 * 023: coalesced Raw Conversation capture trigger. Lives here (not imported
 * from raw-conversations.ts) to avoid a circular import — raw-conversations.ts
 * already depends on ai-index.ts, which depends on this module for
 * `createAction`. `enqueue`'s `singletonKey` + `singletonNextSlot` mean a
 * burst of calls during token streaming collapses into at most one extra run,
 * so it is safe to call after every event append, not just at terminal state.
 */
async function maybeEnqueueRawConversationCapture(actionId: string): Promise<void> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { feature: true, rawConversationCaptureStatus: true },
  });
  if (
    (action?.feature === 'wiki_question' || action?.feature === 'wiki_tool_chat') &&
    (action.rawConversationCaptureStatus === 'pending' || action.rawConversationCaptureStatus === 'captured')
  ) {
    await enqueue(QUEUES.rawConversationCapture, { actionId }, { singletonKey: actionId, singletonNextSlot: true });
  }
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
  // Fire-and-forget: this runs on every streamed token, and enqueueing must
  // never add latency to the chat stream (plan.md performance goal). A failed
  // enqueue here is not fatal — the next event append, or the terminal
  // 'completed'/'error' event, tries again.
  void maybeEnqueueRawConversationCapture(actionId).catch((error) => {
    logger.warn('failed to enqueue raw conversation capture', {
      actionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return row!.id;
}

/**
 * 026: typed emit helpers for the governed tool loop's action events. Payloads
 * are already permission-safe and bounded (command markdown + safe status, no
 * full arbitrary results) before reaching `appendActionEvent`'s size guard.
 */
export function appendToolCallEvent(actionId: string, payload: AiToolCallEventPayload): Promise<number> {
  return appendActionEvent(actionId, 'tool_call', payload as unknown as Record<string, unknown>);
}

export function appendToolProposalEvent(
  actionId: string,
  payload: AiToolProposalEventPayload,
): Promise<number> {
  return appendActionEvent(actionId, 'tool_proposal', payload as unknown as Record<string, unknown>);
}

export function appendToolEvidenceEvent(
  actionId: string,
  payload: AiToolEvidenceEventPayload,
): Promise<number> {
  return appendActionEvent(actionId, 'tool_evidence', payload as unknown as Record<string, unknown>);
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
    rawConversationPageId: row.rawConversationPageId,
    rawConversationCaptureStatus: row.rawConversationCaptureStatus,
  };
}

export async function getAction(ctx: PermCtx, actionId: string): Promise<AiActionView> {
  return toView(await requireActionAccess(ctx, actionId));
}

/** 025: extracts the `channel` marker from a captured page's current
 * published revision `source_metadata`, defaulting to `'wiki-ai'` when
 * absent (legacy pre-025 captures) or invalid. */
function channelFromSourceMetadata(sourceMetadata: unknown): WikiAiChannel {
  const parsed = rawConversationSourceMetadataSchema.safeParse(sourceMetadata);
  return parsed.success ? (parsed.data.channel ?? 'wiki-ai') : 'wiki-ai';
}

/**
 * Resolves the `{pageId, path, url, captureStatus, channel}` pointer for one
 * captured session — the path/url lookup lives here (not in
 * raw-conversations.ts) to avoid a circular import (see
 * `findActionsWithExpiringCapture` above).
 */
export async function resolveRawConversationPointer(
  pageId: string | null,
  captureStatus: RawConversationCaptureStatus,
): Promise<RawConversationPointer | null> {
  if (!pageId) return null;
  const page = await db.query.pages.findFirst({
    where: eq(schema.pages.id, pageId),
    columns: { path: true, currentPublishedVersionId: true },
  });
  if (!page) return null;
  const revision = page.currentPublishedVersionId
    ? await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, page.currentPublishedVersionId),
        columns: { sourceMetadata: true },
      })
    : undefined;
  return {
    pageId,
    path: page.path,
    url: `/spaces/raw/${page.path}`,
    captureStatus,
    channel: channelFromSourceMetadata(revision?.sourceMetadata),
  };
}

/** Batch variant of `resolveRawConversationPointer` for list endpoints, so N
 * sessions never cost N page lookups. */
async function resolveRawConversationPointers(
  rows: Array<{ id: string; rawConversationPageId: string | null; rawConversationCaptureStatus: RawConversationCaptureStatus }>,
): Promise<Map<string, RawConversationPointer | null>> {
  const pageIds = rows.map((row) => row.rawConversationPageId).filter((id): id is string => id !== null);
  const pages = pageIds.length
    ? await db
        .select({ id: schema.pages.id, path: schema.pages.path, currentPublishedVersionId: schema.pages.currentPublishedVersionId })
        .from(schema.pages)
        .where(inArray(schema.pages.id, pageIds))
    : [];
  const revisionIds = pages.map((page) => page.currentPublishedVersionId).filter((id): id is string => id !== null);
  const revisions = revisionIds.length
    ? await db
        .select({ id: schema.pageRevisions.id, sourceMetadata: schema.pageRevisions.sourceMetadata })
        .from(schema.pageRevisions)
        .where(inArray(schema.pageRevisions.id, revisionIds))
    : [];
  const channelByRevisionId = new Map(revisions.map((revision) => [revision.id, channelFromSourceMetadata(revision.sourceMetadata)]));
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const result = new Map<string, RawConversationPointer | null>();
  for (const row of rows) {
    const page = row.rawConversationPageId ? pageById.get(row.rawConversationPageId) : undefined;
    result.set(
      row.id,
      row.rawConversationPageId && page
        ? {
            pageId: row.rawConversationPageId,
            path: page.path,
            url: `/spaces/raw/${page.path}`,
            captureStatus: row.rawConversationCaptureStatus,
            channel: page.currentPublishedVersionId
              ? (channelByRevisionId.get(page.currentPublishedVersionId) ?? 'wiki-ai')
              : 'wiki-ai',
          }
        : null,
    );
  }
  return result;
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
): Promise<{ items: AiActionAdminView[]; total: number }> {
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
  // 023: this admin-only surface (gated above by manage_ai) additionally
  // carries the bounded capture-failure diagnostic — never exposed through
  // getAction/listUserSessions, which a non-admin session owner can reach.
  const items = await Promise.all(
    rows.map(async (row) => ({ ...(await toView(row)), rawConversationCaptureError: row.rawConversationCaptureError })),
  );
  return { items, total: totals[0]?.value ?? 0 };
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
    const term = `%${filters.search.trim()}%`;
    predicates.push(
      sql`(
        exists (
          select 1 from ${schema.aiActionEvents}
          where ${schema.aiActionEvents.actionId} = ${schema.aiActions.id}
            and ${schema.aiActionEvents.type} = 'question'
            and ${schema.aiActionEvents.payload} ->> 'text' ilike ${term}
        )
        or exists (
          select 1 from ${schema.pages}
          join ${schema.pageRevisions} on ${schema.pageRevisions.id} = ${schema.pages.currentPublishedVersionId}
          where ${schema.pages.id} = ${schema.aiActions.rawConversationPageId}
            and ${schema.pageRevisions.sourceMetadata} ->> 'question' ilike ${term}
        )
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

  // 023: for a captured session, the event-log question can disappear once
  // its retention window elapses even though the Raw page persists forever —
  // prefer the durable Raw-derived question so the row never regresses to
  // "content expired" for a session that actually has a canonical record.
  const capturedPageIds = rows.map((row) => row.rawConversationPageId).filter((id): id is string => id !== null);
  const capturedQuestions = capturedPageIds.length
    ? await db
        .select({
          pageId: schema.pages.id,
          question: sql<string | null>`${schema.pageRevisions.sourceMetadata} ->> 'question'`,
        })
        .from(schema.pages)
        .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
        .where(inArray(schema.pages.id, capturedPageIds))
    : [];
  const capturedQuestionByPageId = new Map(capturedQuestions.map((row) => [row.pageId, row.question]));

  const pointerByAction = await resolveRawConversationPointers(rows);
  const items = await Promise.all(
    rows.map(async (row) => {
      const rawQuestion = row.rawConversationPageId ? capturedQuestionByPageId.get(row.rawConversationPageId) : undefined;
      return {
        ...(await toView(row)),
        questionExcerpt: (rawQuestion ?? questionByAction.get(row.id))?.slice(0, 200) ?? null,
        rawConversation: pointerByAction.get(row.id) ?? null,
      };
    }),
  );
  return { items, total: totals[0]?.value ?? 0 };
}

/** Hard-deletes a session (and its cascaded inputs/events) after an ownership check. */
/**
 * Hard-deletes a legacy (never-captured) session. Captured sessions are
 * rejected instead: their Raw Conversation page is the canonical, append-only
 * evidence record (023), and the ai_actions row is the only durable pointer
 * to it — deleting the row would orphan that pointer even though the Raw
 * page itself is preserved by construction (nothing here ever deletes it).
 */
export async function deleteSession(ctx: PermCtx, actionId: string): Promise<void> {
  const row = await requireActionAccess(ctx, actionId);
  if (row.feature !== 'wiki_question') throw new DomainError('NOT_FOUND', 'AI action not found');
  if (row.rawConversationPageId) {
    throw new DomainError('RAW_CONVERSATION_IMMUTABLE', 'This conversation was captured as Raw evidence and cannot be deleted from history');
  }
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

/**
 * 023: wiki_question actions whose retention window is about to close and
 * still have capturable state (pending or previously captured). Read-only —
 * the cleanup job uses this to run one last synchronous capture pass before
 * `cleanupExpiredAiData` purges the underlying event log forever. Kept in
 * this module (not raw-conversations.ts) to avoid a circular import:
 * raw-conversations.ts already depends on ai-index.ts, which depends on this
 * module for `createAction`.
 */
export async function findActionsWithExpiringCapture(): Promise<string[]> {
  const rows = await db
    .select({ id: schema.aiActions.id })
    .from(schema.aiActions)
    .where(
      and(
        lt(schema.aiActions.expiresAt, new Date()),
        eq(schema.aiActions.feature, 'wiki_question'),
        inArray(schema.aiActions.rawConversationCaptureStatus, ['pending', 'captured']),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Marks actions that never reached a real terminal state (still queued or
 * running when their retention window closed — an orphaned/crashed
 * conversation) as expired, so the final capture pass records
 * `conversationStatus: 'expired'` on the Raw page instead of freezing at
 * whatever transient status ('running') it last saw.
 */
export async function expireOrphanedActions(actionIds: string[]): Promise<void> {
  if (actionIds.length === 0) return;
  await db
    .update(schema.aiActions)
    .set({ status: 'expired' })
    .where(and(inArray(schema.aiActions.id, actionIds), inArray(schema.aiActions.status, ['queued', 'running'])));
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
