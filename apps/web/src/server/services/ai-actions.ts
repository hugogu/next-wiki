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
  type AiConversationSummary,
  type AiConversationDetail,
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
      wikiQuestionMinRelevanceScore: 500,
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
 * Raw snapshots are queued only when a Wiki AI action reaches a terminal
 * state. Enqueueing after every streamed token created one pg-boss job per
 * event because `singletonNextSlot` does not deduplicate without a time slot.
 */
async function enqueueRawConversationCaptureIfEligible(actionId: string): Promise<void> {
  const action = await db.query.aiActions.findFirst({
    where: eq(schema.aiActions.id, actionId),
    columns: { feature: true, rawConversationCaptureStatus: true },
  });
  // `wiki_tool_chat` is legacy-only; new tool-enabled turns are canonical
  // `wiki_question` actions with tool workflow records.
  if (
    (action?.feature === 'wiki_question' || action?.feature === 'wiki_tool_chat') &&
    (action.rawConversationCaptureStatus === 'pending' || action.rawConversationCaptureStatus === 'captured')
  ) {
    await enqueue(
      QUEUES.rawConversationCapture,
      { actionId },
      { priority: 10, singletonKey: actionId, singletonSeconds: 60 },
    );
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
  const [provider, model, pageSpace] = await Promise.all([
    row.providerId
      ? db.query.aiProviders.findFirst({ where: eq(schema.aiProviders.id, row.providerId) })
      : null,
    row.modelId ? db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, row.modelId) }) : null,
    row.pageId
      ? db
          .select({ path: schema.pages.path, spaceSlug: schema.spaces.slug })
          .from(schema.pages)
          .leftJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id))
          .where(eq(schema.pages.id, row.pageId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
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
    pagePath: pageSpace?.path ?? null,
    pageSpaceSlug: pageSpace?.spaceSlug ?? null,
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
 * Build a stable conversation key for a wiki_question action: a captured
 * turn (non-null `raw_conversation_page_id`) groups with its sibling turns
 * by Raw page; an uncaptured turn falls back to its live-chat `webSessionId`
 * from `requestMetadata`. Turns of the same chat session share the key,
 * so a conversation is exactly one row in the user-facing history panel
 * regardless of how many turns it contains.
 */
function conversationKeyFor(row: { rawConversationPageId: string | null; requestMetadata: unknown; id: string }): string {
  if (row.rawConversationPageId) return row.rawConversationPageId;
  const webSessionId = (row.requestMetadata as { webSessionId?: unknown } | null)?.webSessionId;
  if (typeof webSessionId === 'string' && webSessionId) return `legacy:${webSessionId}`;
  return `legacy:turn:${row.id}`;
}

/**
 * Lists the signed-in user's own Wiki AI conversations (one row per
 * conversation, aggregating every turn that belongs to the same chat
 * session). Search matches against the `question` event text of any turn
 * or the captured Raw's `sourceMetadata.question`. The `status` filter
 * scopes to the latest turn's status (use the row badge to drill into
 * per-turn breakdown via the detail endpoint).
 */
export async function listUserConversations(
  ctx: PermCtx,
  filters: { search?: string; status?: AiActionStatus; limit?: number; offset?: number } = {},
): Promise<{ items: AiConversationSummary[]; total: number }> {
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

  // Pull every eligible turn for this user once. For a single user's history
  // (bounded by event retention, typically dozens to low thousands) this is
  // cheaper than maintaining a per-conversation materialized view and keeps
  // pagination/filtering in lockstep with the row-level predicates.
  const rows = await db
    .select({
      id: schema.aiActions.id,
      rawConversationPageId: schema.aiActions.rawConversationPageId,
      rawConversationCaptureStatus: schema.aiActions.rawConversationCaptureStatus,
      requestMetadata: schema.aiActions.requestMetadata,
      status: schema.aiActions.status,
      queuedAt: schema.aiActions.queuedAt,
    })
    .from(schema.aiActions)
    .where(where)
    .orderBy(desc(schema.aiActions.queuedAt));

  type TurnRow = typeof rows[number];
  const byKey = new Map<string, {
    turns: TurnRow[];
    latest: TurnRow;
  }>();
  for (const row of rows) {
    const key = conversationKeyFor(row);
    const bucket = byKey.get(key);
    if (!bucket) {
      byKey.set(key, { turns: [row], latest: row });
    } else {
      bucket.turns.push(row);
      if (row.queuedAt > bucket.latest.queuedAt) bucket.latest = row;
    }
  }
  // Sort conversations by their latest turn's queuedAt (the same order the
  // legacy per-turn list produced for the most recent turn of each).
  const conversations = [...byKey.values()].sort(
    (a, b) => b.latest.queuedAt.getTime() - a.latest.queuedAt.getTime(),
  );
  const total = conversations.length;
  const page = conversations.slice(offset, offset + limit);
  const pageRows = page.flatMap((c) => c.turns);
  // One DB round-trip to fetch each turn's `question` event for the excerpt
  // (captured turns may have lost their event-log question to retention).
  const questionEvents = pageRows.length
    ? await db
        .select({ actionId: schema.aiActionEvents.actionId, payload: schema.aiActionEvents.payload })
        .from(schema.aiActionEvents)
        .where(and(
          inArray(schema.aiActionEvents.actionId, pageRows.map((r) => r.id)),
          eq(schema.aiActionEvents.type, 'question'),
        ))
    : [];
  const questionByAction = new Map(
    questionEvents.map((row) => [row.actionId, String((row.payload as Record<string, unknown>).text ?? '')]),
  );
  const capturedPageIds = pageRows
    .map((row) => row.rawConversationPageId)
    .filter((id): id is string => id !== null);
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
  const capturedQuestionByPageId = new Map(
    capturedQuestions.map((row) => [row.pageId, row.question]),
  );
  // One pointer per captured conversation (they share the Raw page).
  const pointerByPageId = await resolveRawConversationPointersByPageId(capturedPageIds);
  const items: AiConversationSummary[] = page.map((conv) => {
    const rawPageId = conv.turns.find((t) => t.rawConversationPageId !== null)?.rawConversationPageId ?? null;
    const rawQuestion = rawPageId ? capturedQuestionByPageId.get(rawPageId) : undefined;
    const firstTurn = conv.turns[conv.turns.length - 1]!;
    const excerpt = (rawQuestion ?? questionByAction.get(firstTurn.id))?.slice(0, 200) ?? null;
    let completedTurnCount = 0;
    let failedTurnCount = 0;
    let cancelledTurnCount = 0;
    for (const turn of conv.turns) {
      if (turn.status === 'completed') completedTurnCount += 1;
      else if (turn.status === 'failed') failedTurnCount += 1;
      else if (turn.status === 'cancelled' || turn.status === 'expired') cancelledTurnCount += 1;
    }
    return {
      conversationKey: conversationKeyFor(conv.latest),
      latestActionId: conv.latest.id,
      latestQueuedAt: conv.latest.queuedAt.toISOString(),
      latestStatus: conv.latest.status,
      questionExcerpt: excerpt,
      rawConversation: rawPageId ? (pointerByPageId.get(rawPageId) ?? null) : null,
      turnCount: conv.turns.length,
      completedTurnCount,
      failedTurnCount,
      cancelledTurnCount,
      turnActionIds: conv.turns.map((t) => t.id),
    };
  });
  return { items, total };
}

/**
 * Batch variant of `resolveRawConversationPointer` keyed by raw_page_id
 * instead of action_id, for conversation-level list endpoints where
 * several turns share the same Raw page.
 */
async function resolveRawConversationPointersByPageId(
  pageIds: string[],
): Promise<Map<string, RawConversationPointer | null>> {
  const pages = pageIds.length
    ? await db
        .select({
          id: schema.pages.id,
          path: schema.pages.path,
          currentPublishedVersionId: schema.pages.currentPublishedVersionId,
        })
        .from(schema.pages)
        .where(inArray(schema.pages.id, pageIds))
    : [];
  const revisionIds = pages
    .map((page) => page.currentPublishedVersionId)
    .filter((id): id is string => id !== null);
  const revisions = revisionIds.length
    ? await db
        .select({ id: schema.pageRevisions.id, sourceMetadata: schema.pageRevisions.sourceMetadata })
        .from(schema.pageRevisions)
        .where(inArray(schema.pageRevisions.id, revisionIds))
    : [];
  const channelByRevisionId = new Map(
    revisions.map((revision) => [revision.id, channelFromSourceMetadata(revision.sourceMetadata)]),
  );
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const result = new Map<string, RawConversationPointer | null>();
  for (const id of pageIds) {
    const page = pageById.get(id);
    result.set(
      id,
      page
        ? {
            pageId: id,
            path: page.path,
            url: `/spaces/raw/${page.path}`,
            captureStatus: 'captured',
            channel: page.currentPublishedVersionId
              ? (channelByRevisionId.get(page.currentPublishedVersionId) ?? 'wiki-ai')
              : 'wiki-ai',
          }
        : null,
    );
  }
  return result;
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

/**
 * Return the full conversation payload (summary + every turn's action +
 * events) for the view modal. The caller passes the `conversationKey`
 * minted by `listUserConversations`: either a `raw_conversation_page_id`
 * for captured conversations or `legacy:<webSessionId>` for uncaptured.
 */
export async function getConversationDetail(
  ctx: PermCtx,
  conversationKey: string,
): Promise<AiConversationDetail | null> {
  const userId = requireSessionUserId(ctx);
  const legacyPrefix = 'legacy:';
  const isLegacy = conversationKey.startsWith(legacyPrefix);
  const legacyId = isLegacy ? conversationKey.slice(legacyPrefix.length) : null;
  // A turn without webSessionId falls back to `legacy:turn:{actionId}` so
  // it groups as a singleton conversation; resolve it by action id rather
  // than by the requestMetadata->webSessionId predicate.
  const isSingleTurnKey = legacyId?.startsWith('turn:') === true;
  const turnActionId = isSingleTurnKey ? legacyId!.slice('turn:'.length) : null;

  const predicates = and(
    eq(schema.aiActions.actorUserId, userId),
    eq(schema.aiActions.feature, 'wiki_question' as const),
    isSingleTurnKey
      ? eq(schema.aiActions.id, turnActionId!)
      : isLegacy
        ? sql`(${schema.aiActions.requestMetadata} ->> 'webSessionId') = ${legacyId}`
        : eq(schema.aiActions.rawConversationPageId, conversationKey),
  );

  const turnRows = await db
    .select()
    .from(schema.aiActions)
    .where(predicates)
    .orderBy(desc(schema.aiActions.queuedAt));

  if (turnRows.length === 0) return null;
  const latest = turnRows[0]!;
  const turnIds = turnRows.map((row) => row.id);

  const eventRows = await db
    .select()
    .from(schema.aiActionEvents)
    .where(inArray(schema.aiActionEvents.actionId, turnIds))
    .orderBy(asc(schema.aiActionEvents.id));
  const eventsByTurn = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    const list = eventsByTurn.get(event.actionId) ?? [];
    list.push(event);
    eventsByTurn.set(event.actionId, list);
  }

  const questionEvents = eventRows.filter((event) => event.type === 'question');
  const questionByAction = new Map(
    questionEvents.map((event) => [event.actionId, String((event.payload as Record<string, unknown>).text ?? '')]),
  );

  const rawPageId = turnRows.find((row) => row.rawConversationPageId !== null)?.rawConversationPageId ?? null;
  let capturedQuestion: string | null = null;
  let pointer: RawConversationPointer | null = null;
  if (rawPageId) {
    const capturedPage = await db
      .select({
        id: schema.pages.id,
        path: schema.pages.path,
        currentPublishedVersionId: schema.pages.currentPublishedVersionId,
      })
      .from(schema.pages)
      .where(eq(schema.pages.id, rawPageId))
      .limit(1)
      .then((rows) => rows[0] ?? null);
    if (capturedPage) {
      const revision = capturedPage.currentPublishedVersionId
        ? await db.query.pageRevisions.findFirst({
            where: (rev, { eq }) => eq(rev.id, capturedPage.currentPublishedVersionId!),
          })
        : null;
      const channel = revision ? channelFromSourceMetadata(revision.sourceMetadata) : 'wiki-ai';
      capturedQuestion = revision
        ? String(((revision.sourceMetadata as Record<string, unknown> | null)?.question as unknown) ?? '')
        : null;
      pointer = {
        pageId: rawPageId,
        path: capturedPage.path,
        url: `/spaces/raw/${capturedPage.path}`,
        captureStatus: 'captured',
        channel,
      };
    }
  }

  const firstTurn = turnRows[turnRows.length - 1]!;
  const excerpt = (capturedQuestion ?? questionByAction.get(firstTurn.id) ?? '').slice(0, 200) || null;

  let completedTurnCount = 0;
  let failedTurnCount = 0;
  let cancelledTurnCount = 0;
  for (const turn of turnRows) {
    if (turn.status === 'completed') completedTurnCount += 1;
    else if (turn.status === 'failed') failedTurnCount += 1;
    else if (turn.status === 'cancelled' || turn.status === 'expired') cancelledTurnCount += 1;
  }

  const turns = await Promise.all(
    turnRows.map(async (row) => ({
      action: await toView(row),
      events: eventsByTurn.get(row.id) ?? [],
    })),
  );

  return {
    conversation: {
      conversationKey,
      latestActionId: latest.id,
      latestQueuedAt: latest.queuedAt.toISOString(),
      latestStatus: latest.status,
      questionExcerpt: excerpt,
      rawConversation: pointer,
      turnCount: turnRows.length,
      completedTurnCount,
      failedTurnCount,
      cancelledTurnCount,
      turnActionIds: turnIds,
    },
    turns,
  } as unknown as AiConversationDetail;
}

/**
 * Hard-delete every turn of a conversation. Refused (with
 * RAW_CONVERSATION_IMMUTABLE) when any turn was captured as a Raw page,
 * mirroring the per-turn `deleteSession` invariant.
 */
export async function deleteConversation(ctx: PermCtx, conversationKey: string): Promise<void> {
  const userId = requireSessionUserId(ctx);
  const legacyPrefix = 'legacy:';
  const isLegacy = conversationKey.startsWith(legacyPrefix);
  const legacyId = isLegacy ? conversationKey.slice(legacyPrefix.length) : null;
  const isSingleTurnKey = legacyId?.startsWith('turn:') === true;
  const turnActionId = isSingleTurnKey ? legacyId!.slice('turn:'.length) : null;
  const turnRows = await db
    .select({ id: schema.aiActions.id, rawConversationPageId: schema.aiActions.rawConversationPageId })
    .from(schema.aiActions)
    .where(
      and(
        eq(schema.aiActions.actorUserId, userId),
        eq(schema.aiActions.feature, 'wiki_question' as const),
        isSingleTurnKey
          ? eq(schema.aiActions.id, turnActionId!)
          : isLegacy
            ? sql`(${schema.aiActions.requestMetadata} ->> 'webSessionId') = ${legacyId}`
            : eq(schema.aiActions.rawConversationPageId, conversationKey),
      ),
    );
  if (turnRows.length === 0) throw new DomainError('NOT_FOUND', 'AI action not found');
  if (turnRows.some((row) => row.rawConversationPageId !== null)) {
    throw new DomainError('RAW_CONVERSATION_IMMUTABLE', 'This conversation was captured as Raw evidence and cannot be deleted from history');
  }
  await db
    .delete(schema.aiActions)
    .where(inArray(schema.aiActions.id, turnRows.map((row) => row.id)));
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
  try {
    await enqueueRawConversationCaptureIfEligible(actionId);
  } catch (error) {
    // The terminal event is durable. Boot recovery retries pending captures if
    // pg-boss is temporarily unavailable at this point.
    logger.warn('failed to enqueue terminal raw conversation capture', {
      actionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

export async function findRecoverableRawConversationCaptureActionIds(): Promise<string[]> {
  const rows = await db
    .select({ id: schema.aiActions.id })
    .from(schema.aiActions)
    .where(
      and(
        inArray(schema.aiActions.feature, ['wiki_question', 'wiki_tool_chat']),
        inArray(schema.aiActions.status, ['completed', 'failed', 'cancelled']),
        inArray(schema.aiActions.rawConversationCaptureStatus, ['pending', 'failed']),
        gt(schema.aiActions.expiresAt, new Date()),
      ),
    );
  return rows.map((row) => row.id);
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
