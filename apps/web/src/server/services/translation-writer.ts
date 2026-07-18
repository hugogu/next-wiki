import { randomUUID } from 'node:crypto';
import { and, eq, isNull, max, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import { buildUserCtx } from '@/server/permissions';
import { persistRevisionMetadata } from './page-metadata';
import { syncRevisionAssetRefs } from './content-assets';
import { addReplicationTasks, kickReplication } from './storage-replication';
import { reconcilePageAcrossIndexes } from './ai-index';
import { assertNoSwitchInProgress } from '@/server/services/writing-mode';

type RunRow = typeof schema.translationRuns.$inferSelect;
type ItemRow = typeof schema.translationRunItems.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Find or create the translation group anchored on a source page. */
export async function ensureTranslationGroup(tx: Tx, sourcePageId: string): Promise<string> {
  const existing = await tx.query.translationGroups.findFirst({
    where: eq(schema.translationGroups.sourcePageId, sourcePageId),
  });
  if (existing) return existing.id;
  const [created] = await tx
    .insert(schema.translationGroups)
    .values({ sourcePageId })
    .returning({ id: schema.translationGroups.id });
  return created!.id;
}

export type TranslationWriteResult =
  | { outcome: 'completed'; translationPageId: string; translationRevisionId: string }
  | { outcome: 'superseded' };

/**
 * Persist an accepted translation as a normal published page revision, plus its
 * provenance and freshness projection, and finalize the run item and counters —
 * all transactionally (data-model write rules 3–4). Before committing it
 * rechecks the source's current published revision/hash: a source change since
 * the item was claimed means the output is stale, so the item is marked
 * `superseded` and nothing is published.
 */
export async function writeTranslation(input: {
  run: RunRow;
  item: ItemRow;
  actorUserId: string;
  translatedMarkdown: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    source: RunRow['usageSource'];
    providerRequestId: string | null;
    durationMs: number | null;
  };
}): Promise<TranslationWriteResult> {
  const { run, item } = input;
  const { html, hash } = renderMarkdown(input.translatedMarkdown);
  const outputHash = hash;
  const revisionId = randomUUID();

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    const source = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.id, item.sourcePageId), isNull(schema.pages.deletedAt)),
    });
    if (!source || !source.currentPublishedVersionId) {
      return { outcome: 'superseded' as const };
    }
    // Compare-before-publish: the source must still be the exact revision we
    // translated. A newer publication supersedes this attempt.
    const currentSource = await tx.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, source.currentPublishedVersionId),
    });
    if (
      !currentSource ||
      currentSource.id !== item.sourceRevisionId ||
      currentSource.contentHash !== item.sourceContentHash
    ) {
      return { outcome: 'superseded' as const };
    }

    const groupId = await ensureTranslationGroup(tx, source.id);

    // Reuse an existing translated page for this (group, locale) — including a
    // soft-deleted one — to honor the unique (space, path, locale) contract.
    const existing = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.translationGroupId, groupId),
        eq(schema.pages.locale, run.targetLocale),
      ),
    });

    let translationPageId: string;
    let versionNumber = 1;
    if (existing) {
      translationPageId = existing.id;
      const versions = await tx
        .select({ value: max(schema.pageRevisions.versionNumber) })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      versionNumber = (versions[0]?.value ?? 0) + 1;
    } else {
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: source.spaceId,
          slug: source.slug,
          path: source.path,
          locale: run.targetLocale,
          title: source.title,
          authorId: input.actorUserId,
          nature: 'generated',
          translationGroupId: groupId,
          sourcePageId: source.id,
        })
        .returning({ id: schema.pages.id });
      translationPageId = page!.id;
    }

    await tx.insert(schema.pageRevisions).values({
      id: revisionId,
      pageId: translationPageId,
      versionNumber,
      locale: run.targetLocale,
      contentType: 'text/markdown',
      contentSource: input.translatedMarkdown,
      contentHtml: html,
      contentHash: hash,
      authorId: input.actorUserId,
      status: 'published',
      publishedAt: new Date(),
      actorKind: 'machine',
    });
    const metadata = await persistRevisionMetadata(tx, {
      revisionId,
      spaceId: source.spaceId,
      source: input.translatedMarkdown,
      fallbackTitle: source.title,
    });
    await syncRevisionAssetRefs(tx, revisionId, input.translatedMarkdown);
    await addReplicationTasks(tx, 'markdown', revisionId, hash);
    await tx
      .update(schema.pages)
      .set({
        title: metadata.title,
        currentPublishedVersionId: revisionId,
        latestVersionId: revisionId,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, translationPageId));

    // Immutable provenance (P8).
    await tx.insert(schema.translationRevisionProvenance).values({
      translationRevisionId: revisionId,
      sourceRevisionId: item.sourceRevisionId,
      runId: run.id,
      itemId: item.id,
      providerId: run.providerId,
      modelId: run.modelId,
      modelExternalId: run.modelExternalId,
      modelDisplayName: run.modelDisplayName,
      promptVersionId: run.promptVersionId,
      promptContentHash: run.promptContentHash,
      providerRequestId: input.usage.providerRequestId,
      outputHash,
      inputTokens: input.usage.inputTokens,
      outputTokens: input.usage.outputTokens,
      cachedTokens: input.usage.cachedTokens,
      usageSource: input.usage.source,
      durationMs: input.usage.durationMs,
    });

    // Freshness projection (upsert).
    await tx
      .insert(schema.pageTranslationStates)
      .values({
        translationPageId,
        sourcePageId: source.id,
        translationGroupId: groupId,
        targetLocale: run.targetLocale,
        freshnessStatus: 'fresh',
        latestSourceRevisionId: currentSource.id,
        latestSourceHash: currentSource.contentHash,
        translatedSourceRevisionId: currentSource.id,
        translatedSourceHash: currentSource.contentHash,
        currentTranslatedRevisionId: revisionId,
        latestRunId: run.id,
        latestItemId: item.id,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .onConflictDoUpdate({
        target: schema.pageTranslationStates.translationPageId,
        set: {
          freshnessStatus: 'fresh',
          latestSourceRevisionId: currentSource.id,
          latestSourceHash: currentSource.contentHash,
          translatedSourceRevisionId: currentSource.id,
          translatedSourceHash: currentSource.contentHash,
          currentTranslatedRevisionId: revisionId,
          latestRunId: run.id,
          latestItemId: item.id,
          lastErrorCode: null,
          lastErrorMessage: null,
          updatedAt: new Date(),
        },
      });

    // Finalize the item.
    await tx
      .update(schema.translationRunItems)
      .set({
        status: 'completed',
        translationPageId,
        translationRevisionId: revisionId,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cachedTokens: input.usage.cachedTokens,
        usageSource: input.usage.source,
        providerRequestId: input.usage.providerRequestId,
        durationMs: input.usage.durationMs,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.translationRunItems.id, item.id));

    // Roll item usage/duration into the run counters.
    await tx
      .update(schema.translationRuns)
      .set({
        processedItems: sql`${schema.translationRuns.processedItems} + 1`,
        completedItems: sql`${schema.translationRuns.completedItems} + 1`,
        totalDurationMs: sql`${schema.translationRuns.totalDurationMs} + ${input.usage.durationMs ?? 0}`,
        inputTokens: sql`coalesce(${schema.translationRuns.inputTokens}, 0) + ${input.usage.inputTokens ?? 0}`,
        outputTokens: sql`coalesce(${schema.translationRuns.outputTokens}, 0) + ${input.usage.outputTokens ?? 0}`,
        cachedTokens: sql`coalesce(${schema.translationRuns.cachedTokens}, 0) + ${input.usage.cachedTokens ?? 0}`,
        usageSource: input.usage.source === 'provider_reported' ? 'provider_reported' : schema.translationRuns.usageSource,
      })
      .where(eq(schema.translationRuns.id, run.id));

    return { outcome: 'completed' as const, translationPageId, translationRevisionId: revisionId };
  });

  if (result.outcome === 'completed') {
    await kickReplication();
    // Index the translated page for search alongside originals.
    await reconcilePageAcrossIndexes(result.translationPageId, buildUserCtx(input.actorUserId, 'admin'));
  }
  return result;
}
