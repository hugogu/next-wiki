import { randomUUID } from 'node:crypto';
import { and, eq, isNull, max } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { normalizeTagName, parseFrontmatter } from '@/server/metadata/frontmatter';
import { patchMetadata, persistRevisionMetadata } from '@/server/services/page-metadata';
import { readMarkdownFromDatabase } from '@/server/content-store/read-router';
import { renderMarkdown } from '@/server/pipeline';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import { enqueueGitExport } from '@/server/services/git-export';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';
import { assertNoSwitchInProgress } from '@/server/services/writing-mode';

type Target = {
  page: typeof schema.pages.$inferSelect;
  revision: typeof schema.pageRevisions.$inferSelect;
  source: string;
};

/**
 * Tag fan-out never mutates a historic revision.  It writes a replacement for
 * each active page head that references the tag, then advances the matching
 * latest/published pointer in the same transaction.  That keeps reader state,
 * frontmatter, tag snapshots, and revision history convergent at completion.
 */
export async function runTagMutation(mutationId: string) {
  const mutation = await db.query.tagMutations.findFirst({ where: eq(schema.tagMutations.id, mutationId) });
  if (!mutation || mutation.status !== 'queued') return;
  await db.update(schema.tagMutations).set({ status: 'running', startedAt: new Date() }).where(eq(schema.tagMutations.id, mutationId));

  try {
    const taggedRows = await db
      .select({ page: schema.pages, revision: schema.pageRevisions })
      .from(schema.pageRevisionTags)
      .innerJoin(schema.pageRevisions, eq(schema.pageRevisionTags.revisionId, schema.pageRevisions.id))
      .innerJoin(schema.pages, eq(schema.pageRevisions.pageId, schema.pages.id))
      .where(and(eq(schema.pageRevisionTags.tagId, mutation.tagId), isNull(schema.pages.deletedAt)));
    const activeRows = taggedRows.filter(({ page, revision }) =>
      page.latestVersionId === revision.id || page.currentPublishedVersionId === revision.id,
    );
    const targets: Target[] = await Promise.all(activeRows.map(async ({ page, revision }) => ({
      page,
      revision,
      source: await readMarkdownFromDatabase(revision),
    })));

    const affectedPageIds = new Set<string>();
    await db.transaction(async (tx) => {
      await assertNoSwitchInProgress(tx);

      const tag = await tx.query.tags.findFirst({
        where: and(eq(schema.tags.id, mutation.tagId), isNull(schema.tags.deletedAt)),
      });
      if (!tag) throw new Error('Tag no longer exists');

      const targetTag = mutation.kind === 'merge' && mutation.targetTagId
        ? await tx.query.tags.findFirst({
            where: and(eq(schema.tags.id, mutation.targetTagId), isNull(schema.tags.deletedAt)),
          })
        : null;
      if (mutation.kind === 'merge' && (!targetTag || targetTag.spaceId !== tag.spaceId)) {
        throw new Error('Merge target tag no longer exists');
      }

      const replacementName = mutation.kind === 'rename' ? mutation.requestedName?.trim() : undefined;
      if (mutation.kind === 'rename' && !replacementName) throw new Error('Rename mutation has no replacement name');
      if (replacementName) {
        await tx.update(schema.tags).set({
          name: replacementName,
          normalizedName: normalizeTagName(replacementName),
          updatedAt: new Date(),
        }).where(eq(schema.tags.id, tag.id));
      }

      const pointerUpdates = new Map<string, {
        page: typeof schema.pages.$inferSelect;
        latestVersionId: string | null;
        currentPublishedVersionId: string | null;
        title: string;
      }>();
      const nextVersionByPage = new Map<string, number>();

      for (const target of targets) {
        const currentTags = (await tx
          .select({ tagId: schema.pageRevisionTags.tagId, tagName: schema.pageRevisionTags.tagName, normalizedName: schema.pageRevisionTags.normalizedName })
          .from(schema.pageRevisionTags)
          .where(eq(schema.pageRevisionTags.revisionId, target.revision.id)))
          .map((row) => row.tagId === tag.id
            ? replacementName ?? targetTag?.name ?? null
            : row.tagName)
          .filter((name): name is string => name !== null)
          .filter((name, index, names) => names.findIndex((candidate) => normalizeTagName(candidate) === normalizeTagName(name)) === index);
        const storedMetadata = await tx.query.pageRevisionMetadata.findFirst({
          where: eq(schema.pageRevisionMetadata.revisionId, target.revision.id),
        });
        const usesFrontmatter = parseFrontmatter(target.source).hasValidFrontmatter;
        const patched = usesFrontmatter
          ? patchMetadata(target.source, { tags: currentTags }, storedMetadata?.title ?? target.page.title)
          : null;
        const nextSource = patched?.source ?? target.source;
        const nextMetadata = usesFrontmatter
          ? {
              title: patched!.metadata.title,
              date: patched!.metadata.date ?? null,
              summary: patched!.metadata.summary ?? null,
              tags: currentTags,
            }
          : {
              title: storedMetadata?.title ?? target.page.title,
              date: storedMetadata?.date ?? null,
              summary: storedMetadata?.summary ?? null,
              tags: currentTags,
            };
        let nextVersion = nextVersionByPage.get(target.page.id);
        if (nextVersion === undefined) {
          const [maximum] = await tx
            .select({ value: max(schema.pageRevisions.versionNumber) })
            .from(schema.pageRevisions)
            .where(eq(schema.pageRevisions.pageId, target.page.id));
          nextVersion = (maximum?.value ?? 0) + 1;
        }
        nextVersionByPage.set(target.page.id, nextVersion + 1);
        const revisionId = randomUUID();
        const { html, hash } = renderMarkdown(nextSource);
        await tx.insert(schema.pageRevisions).values({
          id: revisionId,
          pageId: target.page.id,
          versionNumber: nextVersion,
          contentType: 'text/markdown',
          contentSource: nextSource,
          contentHtml: html,
          contentHash: hash,
          authorId: mutation.requestedBy ?? target.revision.authorId,
          status: target.revision.status,
          publishedAt: target.revision.status === 'published' ? new Date() : null,
          actorKind: 'machine',
        });
        await persistRevisionMetadata(tx, {
          revisionId,
          spaceId: target.page.spaceId,
          source: nextSource,
          fallbackTitle: nextMetadata.title,
          metadata: usesFrontmatter ? undefined : nextMetadata,
        });
        await syncRevisionAssetRefs(tx, revisionId, nextSource);
        await addReplicationTasks(tx, 'markdown', revisionId, hash);

        const update = pointerUpdates.get(target.page.id) ?? {
          page: target.page,
          latestVersionId: target.page.latestVersionId,
          currentPublishedVersionId: target.page.currentPublishedVersionId,
          title: target.page.title,
        };
        if (target.page.latestVersionId === target.revision.id) {
          update.latestVersionId = revisionId;
          update.title = nextMetadata.title;
        }
        if (target.page.currentPublishedVersionId === target.revision.id) {
          update.currentPublishedVersionId = revisionId;
          if (target.page.latestVersionId === target.revision.id) update.title = nextMetadata.title;
        }
        pointerUpdates.set(target.page.id, update);
        affectedPageIds.add(target.page.id);
      }

      for (const update of pointerUpdates.values()) {
        await tx.update(schema.pages).set({
          title: update.title,
          latestVersionId: update.latestVersionId,
          currentPublishedVersionId: update.currentPublishedVersionId,
          updatedAt: new Date(),
        }).where(eq(schema.pages.id, update.page.id));
      }
      if (mutation.kind === 'delete' || mutation.kind === 'merge') {
        await tx.update(schema.tags).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(schema.tags.id, tag.id));
      }
      await tx.update(schema.tagMutations).set({
        status: 'succeeded',
        affectedPageCount: affectedPageIds.size,
        completedAt: new Date(),
      }).where(eq(schema.tagMutations.id, mutationId));
    });
    await kickReplication();
    await enqueueGitExport('publish');
    await Promise.all([...affectedPageIds].map((pageId) => reconcilePageAcrossIndexes(pageId)));
  } catch (error) {
    await db.update(schema.tagMutations).set({
      status: 'failed',
      failure: error instanceof Error ? error.message : 'Tag mutation failed',
      completedAt: new Date(),
    }).where(eq(schema.tagMutations.id, mutationId));
  }
}
