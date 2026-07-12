import { and, count, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type {
  TranslationRunAccepted,
  TranslationRunCreate,
  TranslationRunItemList,
  TranslationRunItemQuery,
  TranslationRunItemView,
  TranslationRunList,
  TranslationRunQuery,
  TranslationRunRetry,
  TranslationRunView,
  TranslationUsageQuery,
  TranslationUsageList,
  TranslationUsageRow,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { enqueue, getBoss, QUEUES } from '@/server/jobs/runtime';
import { assertAiEnabled } from './ai-actions';
import { assertCanManageTranslations } from './translation-config';

const DEFAULT_SPACE_SLUG = 'default';
const ACTIVE = ['queued', 'running'] as const;
const TERMINAL = ['completed', 'completed_with_warnings', 'failed', 'cancelled'] as const;

type RunRow = typeof schema.translationRuns.$inferSelect;
type ItemRow = typeof schema.translationRunItems.$inferSelect;

// ---- View mappers ----------------------------------------------------------

function usageTotals(row: {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  usageSource: RunRow['usageSource'];
}) {
  return {
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    cachedTokens: row.cachedTokens,
    source: row.usageSource,
  };
}

export function runView(row: RunRow, modelName: string | null = null): TranslationRunView {
  const isActive = ACTIVE.includes(row.status as (typeof ACTIVE)[number]);
  return {
    id: row.id,
    targetLocale: row.targetLocale,
    kind: row.kind,
    status: row.status,
    predecessorRunId: row.predecessorRunId,
    modelId: row.modelId,
    modelName: modelName ?? row.modelDisplayName,
    promptVersionId: row.promptVersionId,
    totalItems: row.totalItems,
    processedItems: row.processedItems,
    completedItems: row.completedItems,
    skippedItems: row.skippedItems,
    failedItems: row.failedItems,
    supersededItems: row.supersededItems,
    currentItem: row.currentItem,
    usage: usageTotals(row),
    totalDurationMs: row.totalDurationMs,
    cancelRequested: row.cancelRequested,
    pauseRequested: row.pauseRequested,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    canPause: isActive,
    canResume: row.status === 'paused',
    canCancel: isActive || row.status === 'paused',
    canRetry: ['failed', 'cancelled', 'completed_with_warnings'].includes(row.status),
  };
}

export function itemView(row: ItemRow): TranslationRunItemView {
  return {
    id: row.id,
    runId: row.runId,
    sourcePageId: row.sourcePageId,
    sourceRevisionId: row.sourceRevisionId,
    translationPageId: row.translationPageId,
    translationRevisionId: row.translationRevisionId,
    targetLocale: row.targetLocale,
    targetPath: row.targetPath,
    status: row.status,
    attempts: row.attempts,
    retryAvailable: row.retryAvailable,
    usage: usageTotals(row),
    durationMs: row.durationMs,
    warningCode: row.warningCode,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

// ---- Model / prompt resolution --------------------------------------------

/**
 * Resolve a compatible configured text-generation model for a run, either the
 * explicitly requested model or the language/text default. Validates that the
 * model exists, its provider is enabled, it is available, and it advertises the
 * text-generation capability (P2 — provider-neutral, frozen at run creation).
 */
async function resolveTextModel(
  requestedModelId: string | undefined,
  targetLocale: string,
): Promise<{ model: typeof schema.aiModels.$inferSelect; provider: typeof schema.aiProviders.$inferSelect }> {
  let modelId = requestedModelId;
  if (!modelId) {
    const lang = await db.query.translationLanguages.findFirst({
      where: eq(schema.translationLanguages.code, targetLocale),
    });
    modelId = lang?.defaultModelId ?? undefined;
  }
  if (!modelId) {
    const assignment = await db.query.aiPurposeAssignments.findFirst({
      where: eq(schema.aiPurposeAssignments.purpose, 'wiki_text'),
    });
    modelId = assignment?.modelId ?? undefined;
  }
  if (!modelId) {
    throw new DomainError('MODEL_UNAVAILABLE', 'No text-generation model is configured');
  }
  const model = await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, modelId) });
  if (!model) throw new DomainError('MODEL_UNAVAILABLE', 'The selected model was not found');
  if (model.availability !== 'available') {
    throw new DomainError('MODEL_UNAVAILABLE', 'The selected model is unavailable');
  }
  const provider = await db.query.aiProviders.findFirst({
    where: eq(schema.aiProviders.id, model.providerId),
  });
  if (!provider || !provider.enabled) {
    throw new DomainError('MODEL_UNAVAILABLE', 'The model provider is disabled');
  }
  const capability = await db.query.aiModelCapabilities.findFirst({
    where: and(
      eq(schema.aiModelCapabilities.modelId, model.id),
      eq(schema.aiModelCapabilities.capability, 'text_generation'),
      eq(schema.aiModelCapabilities.supported, true),
    ),
  });
  const textModality =
    model.inputModalities.includes('text') && model.outputModalities.includes('text');
  if (!capability && !textModality) {
    throw new DomainError('CAPABILITY_MISMATCH', 'The selected model cannot generate text');
  }
  return { model, provider };
}

async function resolvePromptVersion(
  requestedVersionId: string | undefined,
  targetLocale: string,
): Promise<typeof schema.translationPromptVersions.$inferSelect | null> {
  let versionId = requestedVersionId;
  if (!versionId) {
    const lang = await db.query.translationLanguages.findFirst({
      where: eq(schema.translationLanguages.code, targetLocale),
    });
    versionId = lang?.defaultPromptVersionId ?? undefined;
  }
  if (!versionId) return null;
  const version = await db.query.translationPromptVersions.findFirst({
    where: eq(schema.translationPromptVersions.id, versionId),
  });
  if (!version) throw new DomainError('INVALID_TRANSLATION_INPUT', 'Prompt version not found');
  return version;
}

// ---- Eligible source resolution -------------------------------------------

async function getDefaultSpaceId(): Promise<string> {
  const space = await db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  return space.id;
}

/**
 * Resolve the published source pages eligible for a run's scope. Source pages
 * only (translation_group_id is null), not deleted, with a current published
 * revision. For `mode: 'missing'`, pages that already have a fresh translation
 * for the target locale are excluded.
 */
async function resolveEligibleSources(
  spaceId: string,
  input: TranslationRunCreate,
): Promise<Array<{ pageId: string; path: string; revisionId: string; contentHash: string }>> {
  const conditions: SQL[] = [
    eq(schema.pages.spaceId, spaceId),
    isNull(schema.pages.deletedAt),
    isNull(schema.pages.translationGroupId),
    sql`${schema.pages.currentPublishedVersionId} is not null`,
  ];
  if (input.scope.kind === 'page_ids') {
    conditions.push(inArray(schema.pages.id, input.scope.pageIds));
  } else if (input.scope.kind === 'paths') {
    conditions.push(inArray(schema.pages.path, input.scope.paths));
  }
  const rows = await db
    .select({
      pageId: schema.pages.id,
      path: schema.pages.path,
      revisionId: schema.pageRevisions.id,
      contentHash: schema.pageRevisions.contentHash,
    })
    .from(schema.pages)
    .innerJoin(
      schema.pageRevisions,
      eq(schema.pageRevisions.id, schema.pages.currentPublishedVersionId),
    )
    .where(and(...conditions));

  if (input.mode === 'all') return rows;

  // mode: 'missing' — drop pages that already have an up-to-date translation.
  const pageIds = rows.map((r) => r.pageId);
  if (pageIds.length === 0) return rows;
  const states = await db
    .select({
      sourcePageId: schema.pageTranslationStates.sourcePageId,
      freshness: schema.pageTranslationStates.freshnessStatus,
    })
    .from(schema.pageTranslationStates)
    .where(
      and(
        inArray(schema.pageTranslationStates.sourcePageId, pageIds),
        eq(schema.pageTranslationStates.targetLocale, input.targetLocale),
      ),
    );
  const fresh = new Set(
    states.filter((s) => s.freshness === 'fresh').map((s) => s.sourcePageId),
  );
  return rows.filter((r) => !fresh.has(r.pageId));
}

// ---- Run creation ----------------------------------------------------------

export async function createRun(
  ctx: PermCtx,
  input: TranslationRunCreate,
  options: { kind?: RunRow['kind']; predecessorRunId?: string } = {},
): Promise<TranslationRunAccepted> {
  const actorId = assertCanManageTranslations(ctx);
  await assertAiEnabled();
  if (!getBoss()) {
    throw new DomainError('JOB_QUEUE_UNAVAILABLE', 'Background work is unavailable');
  }

  const language = await db.query.translationLanguages.findFirst({
    where: eq(schema.translationLanguages.code, input.targetLocale),
  });
  if (!language || !language.enabled || language.retiredAt) {
    throw new DomainError('INVALID_TRANSLATION_INPUT', 'The target language is not enabled');
  }

  const { model, provider } = await resolveTextModel(input.modelId, input.targetLocale);
  const promptVersion = await resolvePromptVersion(input.promptVersionId, input.targetLocale);

  const spaceId = await getDefaultSpaceId();
  const sources = await resolveEligibleSources(spaceId, input);
  if (sources.length === 0) {
    throw new DomainError('SOURCE_NOT_TRANSLATABLE', 'No eligible published pages to translate');
  }

  try {
    const run = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.translationRuns)
        .values({
          targetLocale: input.targetLocale,
          kind: options.kind ?? 'initial',
          status: 'queued',
          predecessorRunId: options.predecessorRunId ?? null,
          providerId: provider.id,
          modelId: model.id,
          modelExternalId: model.externalId,
          modelDisplayName: model.displayName,
          promptVersionId: promptVersion?.id ?? null,
          promptContentHash: promptVersion?.contentHash ?? null,
          scopeSnapshot: { scope: input.scope, mode: input.mode },
          // Claim the language's active slot; the partial-unique index rejects a
          // second concurrent active run for the same locale.
          activeLanguageSlot: input.targetLocale,
          totalItems: sources.length,
          actorUserId: actorId,
        })
        .returning();

      await tx.insert(schema.translationRunItems).values(
        sources.map((s) => ({
          runId: created!.id,
          sourcePageId: s.pageId,
          sourceRevisionId: s.revisionId,
          sourceContentHash: s.contentHash,
          targetLocale: input.targetLocale,
          targetPath: s.path,
          providerId: provider.id,
          modelId: model.id,
          promptVersionId: promptVersion?.id ?? null,
        })),
      );
      return created!;
    });

    await enqueue(QUEUES.translation, { runId: run.id });
    return {
      id: run.id,
      targetLocale: run.targetLocale,
      status: 'queued',
      detailUrl: `/api/translations/runs/${run.id}`,
    };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new DomainError('TRANSLATION_ALREADY_RUNNING', 'This language already has active work');
    }
    throw error;
  }
}

// ---- Queries ---------------------------------------------------------------

async function modelNameFor(row: RunRow): Promise<string | null> {
  return row.modelDisplayName;
}

export async function listRuns(
  ctx: PermCtx,
  query: TranslationRunQuery,
): Promise<TranslationRunList> {
  assertCanManageTranslations(ctx);
  const conditions: SQL[] = [];
  if (query.targetLocale) conditions.push(eq(schema.translationRuns.targetLocale, query.targetLocale));
  if (query.status) conditions.push(eq(schema.translationRuns.status, query.status));
  if (query.kind) conditions.push(eq(schema.translationRuns.kind, query.kind));
  if (query.modelId) conditions.push(eq(schema.translationRuns.modelId, query.modelId));
  if (query.from) conditions.push(gte(schema.translationRuns.queuedAt, new Date(query.from)));
  if (query.to) conditions.push(lte(schema.translationRuns.queuedAt, new Date(query.to)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(schema.translationRuns)
      .where(where)
      .orderBy(desc(schema.translationRuns.queuedAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(schema.translationRuns).where(where),
  ]);
  return { items: rows.map((r) => runView(r)), total: totals[0]?.value ?? 0 };
}

export async function getRun(ctx: PermCtx, id: string): Promise<TranslationRunView> {
  assertCanManageTranslations(ctx);
  const row = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.id, id),
  });
  if (!row) throw new DomainError('TRANSLATION_NOT_FOUND', 'Translation run not found');
  return runView(row, await modelNameFor(row));
}

export async function listItems(
  ctx: PermCtx,
  runId: string,
  query: TranslationRunItemQuery,
): Promise<TranslationRunItemList> {
  assertCanManageTranslations(ctx);
  const conditions: SQL[] = [eq(schema.translationRunItems.runId, runId)];
  if (query.status) conditions.push(eq(schema.translationRunItems.status, query.status));
  if (query.sourcePageId) {
    conditions.push(eq(schema.translationRunItems.sourcePageId, query.sourcePageId));
  }
  if (query.q) {
    conditions.push(sql`${schema.translationRunItems.targetPath} ilike ${'%' + query.q + '%'}`);
  }
  const where = and(...conditions);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(schema.translationRunItems)
      .where(where)
      .orderBy(schema.translationRunItems.createdAt)
      .limit(query.limit)
      .offset(query.offset),
    db.select({ value: count() }).from(schema.translationRunItems).where(where),
  ]);
  return { items: rows.map(itemView), total: totals[0]?.value ?? 0 };
}

// ---- Controls --------------------------------------------------------------

export async function requestPause(ctx: PermCtx, id: string): Promise<TranslationRunView> {
  assertCanManageTranslations(ctx);
  const row = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.id, id),
  });
  if (!row) throw new DomainError('TRANSLATION_NOT_FOUND', 'Translation run not found');
  if (!ACTIVE.includes(row.status as (typeof ACTIVE)[number])) {
    throw new DomainError('RUN_NOT_ACTIVE', 'Only an active run can be paused');
  }
  const [updated] = await db
    .update(schema.translationRuns)
    .set({ pauseRequested: true })
    .where(eq(schema.translationRuns.id, id))
    .returning();
  return runView(updated!);
}

export async function requestCancellation(ctx: PermCtx, id: string): Promise<TranslationRunView> {
  assertCanManageTranslations(ctx);
  const row = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.id, id),
  });
  if (!row) throw new DomainError('TRANSLATION_NOT_FOUND', 'Translation run not found');
  if (TERMINAL.includes(row.status as (typeof TERMINAL)[number])) {
    throw new DomainError('RUN_NOT_ACTIVE', 'The run is already finished');
  }
  // A paused run has no live worker to observe the flag; terminate it directly
  // and mark unstarted items cancelled, releasing the language slot.
  if (row.status === 'paused') {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.translationRunItems)
        .set({ status: 'cancelled', finishedAt: new Date() })
        .where(
          and(
            eq(schema.translationRunItems.runId, id),
            inArray(schema.translationRunItems.status, ['pending', 'running']),
          ),
        );
      await tx
        .update(schema.translationRuns)
        .set({
          status: 'cancelled',
          activeLanguageSlot: null,
          finishedAt: new Date(),
          currentItem: null,
        })
        .where(eq(schema.translationRuns.id, id));
    });
    const done = await db.query.translationRuns.findFirst({
      where: eq(schema.translationRuns.id, id),
    });
    return runView(done!);
  }
  const [updated] = await db
    .update(schema.translationRuns)
    .set({ cancelRequested: true })
    .where(eq(schema.translationRuns.id, id))
    .returning();
  return runView(updated!);
}

export async function resume(ctx: PermCtx, id: string): Promise<TranslationRunAccepted> {
  assertCanManageTranslations(ctx);
  const row = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.id, id),
  });
  if (!row) throw new DomainError('TRANSLATION_NOT_FOUND', 'Translation run not found');
  if (row.status !== 'paused') {
    throw new DomainError('RUN_NOT_PAUSED', 'Only a paused run can be resumed');
  }
  if (!getBoss()) {
    throw new DomainError('JOB_QUEUE_UNAVAILABLE', 'Background work is unavailable');
  }
  // Requeue the same run with its frozen inputs; the worker skips finished items
  // and processes only unfinished/reclaimed work. The language slot was held
  // throughout the pause so no competing run can have started.
  await db
    .update(schema.translationRuns)
    .set({ status: 'queued', pauseRequested: false })
    .where(eq(schema.translationRuns.id, id));
  await enqueue(QUEUES.translation, { runId: id });
  return { id, targetLocale: row.targetLocale, status: 'queued', detailUrl: `/api/translations/runs/${id}` };
}

/**
 * Create a successor run (retry/replacement) for failed/cancelled/superseded or
 * selected pages, optionally with a different model/prompt. History is never
 * mutated — the predecessor run and its revisions remain immutable.
 */
export async function retry(
  ctx: PermCtx,
  id: string,
  input: TranslationRunRetry,
): Promise<TranslationRunAccepted> {
  assertCanManageTranslations(ctx);
  const row = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.id, id),
  });
  if (!row) throw new DomainError('TRANSLATION_NOT_FOUND', 'Translation run not found');

  let scope = input.scope;
  if (!scope) {
    // Default: retry the pages that did not succeed in the predecessor.
    const unfinished = await db
      .select({ sourcePageId: schema.translationRunItems.sourcePageId })
      .from(schema.translationRunItems)
      .where(
        and(
          eq(schema.translationRunItems.runId, id),
          inArray(schema.translationRunItems.status, ['failed', 'cancelled', 'superseded']),
        ),
      );
    const pageIds = unfinished.map((u) => u.sourcePageId);
    if (pageIds.length === 0) {
      throw new DomainError('INVALID_TRANSLATION_INPUT', 'No pages require a retry');
    }
    scope = { kind: 'page_ids', pageIds };
  }

  const isReplacement = Boolean(input.modelId || input.promptVersionId);
  return createRun(
    ctx,
    {
      targetLocale: row.targetLocale,
      modelId: input.modelId,
      promptVersionId: input.promptVersionId,
      scope,
      mode: 'all',
    },
    { kind: isReplacement ? 'replacement' : 'resume', predecessorRunId: id },
  );
}

// ---- Worker & recovery helpers --------------------------------------------

export async function readRunControlSignal(id: string): Promise<'cancel' | 'pause' | null> {
  const row = await db
    .select({
      cancelRequested: schema.translationRuns.cancelRequested,
      pauseRequested: schema.translationRuns.pauseRequested,
    })
    .from(schema.translationRuns)
    .where(eq(schema.translationRuns.id, id))
    .limit(1);
  if (row[0]?.cancelRequested) return 'cancel';
  if (row[0]?.pauseRequested) return 'pause';
  return null;
}

export async function findRecoverableTranslationRunIds(): Promise<string[]> {
  const rows = await db
    .select({ id: schema.translationRuns.id })
    .from(schema.translationRuns)
    .where(inArray(schema.translationRuns.status, ['queued', 'running']));
  return rows.map((r) => r.id);
}

export async function markRunPaused(id: string): Promise<void> {
  await db
    .update(schema.translationRuns)
    .set({ status: 'paused', pauseRequested: false, currentItem: null })
    .where(eq(schema.translationRuns.id, id));
}

export async function markRunTerminal(
  id: string,
  status: Extract<RunRow['status'], 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled'>,
  values: Partial<RunRow> = {},
): Promise<void> {
  await db
    .update(schema.translationRuns)
    .set({
      ...values,
      status,
      activeLanguageSlot: null,
      finishedAt: new Date(),
      currentItem: null,
    })
    .where(eq(schema.translationRuns.id, id));
}

// ---- Usage analytics -------------------------------------------------------

export async function getUsage(
  ctx: PermCtx,
  query: TranslationUsageQuery,
): Promise<TranslationUsageList> {
  assertCanManageTranslations(ctx);
  const conditions: SQL[] = [];
  if (query.from) conditions.push(gte(schema.translationRunItems.finishedAt, new Date(query.from)));
  if (query.to) conditions.push(lte(schema.translationRunItems.finishedAt, new Date(query.to)));
  if (query.targetLocale) {
    conditions.push(eq(schema.translationRunItems.targetLocale, query.targetLocale));
  }
  if (query.modelId) conditions.push(eq(schema.translationRunItems.modelId, query.modelId));
  const where = conditions.length ? and(...conditions) : undefined;

  const keyExpr =
    query.groupBy === 'run'
      ? sql<string>`${schema.translationRunItems.runId}::text`
      : query.groupBy === 'model'
        ? sql<string>`coalesce(${schema.translationRunItems.modelId}::text, 'unknown')`
        : query.groupBy === 'day'
          ? sql<string>`to_char(date_trunc('day', ${schema.translationRunItems.finishedAt}), 'YYYY-MM-DD')`
          : sql<string>`${schema.translationRunItems.targetLocale}`;

  const rows = await db
    .select({
      key: keyExpr,
      completed: sql<number>`count(*) filter (where ${schema.translationRunItems.status} = 'completed')`,
      skipped: sql<number>`count(*) filter (where ${schema.translationRunItems.status} = 'skipped')`,
      failed: sql<number>`count(*) filter (where ${schema.translationRunItems.status} = 'failed')`,
      reportedInputTokens: sql<number>`coalesce(sum(${schema.translationRunItems.inputTokens}) filter (where ${schema.translationRunItems.usageSource} = 'provider_reported'), 0)`,
      reportedOutputTokens: sql<number>`coalesce(sum(${schema.translationRunItems.outputTokens}) filter (where ${schema.translationRunItems.usageSource} = 'provider_reported'), 0)`,
      estimatedInputTokens: sql<number>`coalesce(sum(${schema.translationRunItems.inputTokens}) filter (where ${schema.translationRunItems.usageSource} = 'estimated'), 0)`,
      estimatedOutputTokens: sql<number>`coalesce(sum(${schema.translationRunItems.outputTokens}) filter (where ${schema.translationRunItems.usageSource} = 'estimated'), 0)`,
      unavailableCount: sql<number>`count(*) filter (where ${schema.translationRunItems.usageSource} = 'unavailable')`,
      totalDurationMs: sql<number>`coalesce(sum(${schema.translationRunItems.durationMs}), 0)`,
    })
    .from(schema.translationRunItems)
    .where(where)
    .groupBy(keyExpr)
    .orderBy(keyExpr);

  const normalized: TranslationUsageRow[] = rows.map((r) => ({
    key: r.key,
    completed: Number(r.completed),
    skipped: Number(r.skipped),
    failed: Number(r.failed),
    reportedInputTokens: Number(r.reportedInputTokens),
    reportedOutputTokens: Number(r.reportedOutputTokens),
    estimatedInputTokens: Number(r.estimatedInputTokens),
    estimatedOutputTokens: Number(r.estimatedOutputTokens),
    unavailableCount: Number(r.unavailableCount),
    totalDurationMs: Number(r.totalDurationMs),
  }));
  return { rows: normalized };
}
