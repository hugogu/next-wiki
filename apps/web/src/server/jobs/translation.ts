import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { logger } from '@/server/logger';
import { createAiProviderAdapter } from '@/server/ai/registry';
import { providerRuntime } from '@/server/services/ai-admin';
import {
  AiProviderError,
  normalizeProviderError,
  sanitizeProviderMessage,
} from '@/server/ai/types';
import { buildTranslationInput, normalizeGeneratedMarkdown } from '@/server/ai/prompts/translation';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { writeTranslation } from '@/server/services/translation-writer';
import {
  markRunPaused,
  markRunTerminal,
  readRunControlSignal,
} from '@/server/services/translations';

type RunRow = typeof schema.translationRuns.$inferSelect;
type ItemRow = typeof schema.translationRunItems.$inferSelect;

const MAX_ATTEMPTS = 3;

/**
 * Process one translation run to a terminal or paused state. Idempotent and
 * resumable: it only claims `pending` items, so a re-enqueue after a crash,
 * pause, or resume continues exactly where it left off without regenerating
 * finished pages.
 */
export async function runTranslationRun(runId: string): Promise<void> {
  const run = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.id, runId),
  });
  if (!run) return;
  if (['completed', 'completed_with_warnings', 'failed', 'cancelled', 'paused'].includes(run.status)) {
    // A paused run is only resumed via the resume endpoint (status -> queued).
    if (run.status !== 'paused') return;
  }

  await db
    .update(schema.translationRuns)
    .set({ status: 'running', startedAt: run.startedAt ?? new Date() })
    .where(eq(schema.translationRuns.id, runId));

  try {
    for (;;) {
      const signal = await readRunControlSignal(runId);
      if (signal === 'cancel') {
        await cancelRemaining(runId);
        await markRunTerminal(runId, 'cancelled');
        return;
      }
      if (signal === 'pause') {
        await markRunPaused(runId);
        return;
      }

      const item = await claimNextItem(runId);
      if (!item) break;

      const fresh = await db.query.translationRuns.findFirst({
        where: eq(schema.translationRuns.id, runId),
      });
      if (!fresh) return;
      await db
        .update(schema.translationRuns)
        .set({ currentItem: item.targetPath })
        .where(eq(schema.translationRuns.id, runId));

      await processItem(fresh, item);
    }

    await finalizeRun(runId);
  } catch (error) {
    logger.error('translation run failed', {
      runId,
      message: sanitizeProviderMessage(String((error as Error)?.message ?? error)),
    });
    await markRunTerminal(runId, 'failed', {
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: sanitizeProviderMessage(String((error as Error)?.message ?? 'Translation run failed')),
    });
  }
}

/** Atomically claim the next pending item, guarding against a lost race. */
async function claimNextItem(runId: string): Promise<ItemRow | null> {
  for (;;) {
    const pending = await db
      .select({ id: schema.translationRunItems.id })
      .from(schema.translationRunItems)
      .where(
        and(
          eq(schema.translationRunItems.runId, runId),
          eq(schema.translationRunItems.status, 'pending'),
        ),
      )
      .orderBy(asc(schema.translationRunItems.availableAt))
      .limit(1);
    if (!pending[0]) return null;
    const [claimed] = await db
      .update(schema.translationRunItems)
      .set({
        status: 'running',
        attempts: sql`${schema.translationRunItems.attempts} + 1`,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.translationRunItems.id, pending[0].id),
          eq(schema.translationRunItems.status, 'pending'),
        ),
      )
      .returning();
    if (claimed) return claimed;
    // Lost the race — try the next pending row.
  }
}

async function processItem(run: RunRow, item: ItemRow): Promise<void> {
  try {
    const source = await db.query.pages.findFirst({
      where: eq(schema.pages.id, item.sourcePageId),
    });
    if (!source || source.deletedAt || !source.currentPublishedVersionId) {
      await markItem(run.id, item.id, 'skipped', { warningCode: 'SOURCE_UNAVAILABLE' });
      return;
    }
    const sourceRevision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, item.sourceRevisionId ?? source.currentPublishedVersionId),
    });
    if (!sourceRevision) {
      await markItem(run.id, item.id, 'skipped', { warningCode: 'SOURCE_UNAVAILABLE' });
      return;
    }
    const sourceMarkdown = await readMarkdownFromDatabase(sourceRevision);

    const styleBody = await loadStyleBody(run.promptVersionId);
    const model = run.modelId
      ? await db.query.aiModels.findFirst({ where: eq(schema.aiModels.id, run.modelId) })
      : null;

    const generated = await generateWithRetry(run, item, sourceMarkdown, styleBody, model?.maxOutputTokens ?? undefined);

    const markdown = normalizeGeneratedMarkdown(generated.text);
    if (!markdown) {
      await markItem(run.id, item.id, 'failed', {
        errorCode: 'INVALID_RESPONSE',
        errorMessage: 'The model returned empty or unusable output',
      });
      return;
    }

    const result = await writeTranslation({
      run,
      item,
      actorUserId: run.actorUserId ?? source.authorId,
      translatedMarkdown: markdown,
      usage: generated.usage,
    });

    if (result.outcome === 'superseded') {
      // The source changed while we translated; do not publish stale output.
      await markItem(run.id, item.id, 'superseded', {});
    }
    // On 'completed', writeTranslation already finalized the item + counters.
  } catch (error) {
    const normalized = normalizeProviderError(error);
    await markItem(run.id, item.id, 'failed', {
      errorCode: normalized.code,
      errorMessage: normalized.message,
    });
  }
}

async function generateWithRetry(
  run: RunRow,
  item: ItemRow,
  sourceMarkdown: string,
  styleBody: string | null,
  maxOutputTokens: number | undefined,
): Promise<{
  text: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    source: RunRow['usageSource'];
    providerRequestId: string | null;
    durationMs: number | null;
  };
}> {
  if (!run.providerId || !run.modelExternalId) {
    throw new AiProviderError('PROVIDER_UNAVAILABLE', 'The run has no frozen model to call');
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    const started = Date.now();
    try {
      const adapter = createAiProviderAdapter(await providerRuntime(run.providerId));
      let text = '';
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;
      let cachedTokens: number | null = null;
      let providerRequestId: string | null = null;
      for await (const event of adapter.streamText(
        buildTranslationInput({
          actionId: `${run.id}:${item.id}`,
          modelExternalId: run.modelExternalId,
          targetLocale: run.targetLocale,
          sourceMarkdown,
          styleBody,
          maxOutputTokens,
          abortSignal: new AbortController().signal,
        }),
      )) {
        if (event.type === 'delta') text += event.text;
        else if (event.type === 'usage') {
          inputTokens = event.inputTokens ?? inputTokens;
          outputTokens = event.outputTokens ?? outputTokens;
          cachedTokens = event.cachedInputTokens ?? cachedTokens;
        } else if (event.type === 'provider_request_id') providerRequestId = event.id;
      }
      const durationMs = Date.now() - started;
      const reported = inputTokens !== null || outputTokens !== null;
      const usage = reported
        ? { inputTokens, outputTokens, cachedTokens, source: 'provider_reported' as const, providerRequestId, durationMs }
        : {
            // Fall back to a transparent character-based estimate so analytics
            // never records missing usage as zero.
            inputTokens: Math.ceil(sourceMarkdown.length / 4),
            outputTokens: Math.ceil(text.length / 4),
            cachedTokens: null,
            source: 'estimated' as const,
            providerRequestId,
            durationMs,
          };
      return { text, usage };
    } catch (error) {
      lastError = error;
      const normalized = normalizeProviderError(error);
      if (!normalized.retryable) throw normalized;
    }
  }
  throw normalizeProviderError(lastError);
}

async function loadStyleBody(promptVersionId: string | null): Promise<string | null> {
  if (!promptVersionId) return null;
  const version = await db.query.translationPromptVersions.findFirst({
    where: eq(schema.translationPromptVersions.id, promptVersionId),
  });
  return version?.body ?? null;
}

/**
 * Finalize a non-terminal item outcome (skipped/failed/superseded) and roll the
 * run counters forward. `completed` is handled transactionally by the writer.
 */
async function markItem(
  runId: string,
  itemId: string,
  status: Extract<ItemRow['status'], 'skipped' | 'failed' | 'superseded'>,
  fields: { warningCode?: string; errorCode?: string; errorMessage?: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(schema.translationRunItems)
      .set({
        status,
        warningCode: fields.warningCode ?? null,
        errorCode: fields.errorCode ?? null,
        errorMessage: fields.errorMessage ? sanitizeProviderMessage(fields.errorMessage) : null,
        retryAvailable: status !== 'skipped',
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.translationRunItems.id, itemId));
    const counter =
      status === 'skipped'
        ? { skippedItems: sql`${schema.translationRuns.skippedItems} + 1` }
        : status === 'failed'
          ? { failedItems: sql`${schema.translationRuns.failedItems} + 1` }
          : { supersededItems: sql`${schema.translationRuns.supersededItems} + 1` };
    await tx
      .update(schema.translationRuns)
      .set({ processedItems: sql`${schema.translationRuns.processedItems} + 1`, ...counter })
      .where(eq(schema.translationRuns.id, runId));
  });
}

async function cancelRemaining(runId: string): Promise<void> {
  await db
    .update(schema.translationRunItems)
    .set({ status: 'cancelled', finishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.translationRunItems.runId, runId),
        inArray(schema.translationRunItems.status, ['pending', 'running']),
      ),
    );
}

async function finalizeRun(runId: string): Promise<void> {
  const run = await db.query.translationRuns.findFirst({
    where: eq(schema.translationRuns.id, runId),
  });
  if (!run) return;
  const hadFailures = run.failedItems > 0 || run.supersededItems > 0;
  const allFailed = run.completedItems === 0 && run.failedItems > 0;
  const status = allFailed ? 'failed' : hadFailures ? 'completed_with_warnings' : 'completed';
  await markRunTerminal(runId, status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
