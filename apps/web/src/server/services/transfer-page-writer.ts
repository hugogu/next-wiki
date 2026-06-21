import { randomUUID } from 'node:crypto';
import { and, eq, isNull, max } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import { syncRevisionAssetRefs } from './content-assets';
import { addReplicationTasks, kickReplication } from './storage-replication';
import { enqueueGitExport } from './git-export';
import { reconcilePageAcrossIndexes } from './ai-index';
import { buildUserCtx } from '@/server/permissions';

export async function writeImportedPage(input: {
  actorUserId: string;
  path: string;
  locale: string;
  title: string;
  markdown: string;
  action: 'create' | 'replace' | 'skip';
}): Promise<{ pageId: string | null; revisionId: string | null; action: typeof input.action }> {
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'default') });
  if (!space) throw new Error('Default space not found');
  const existing = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, input.path),
      eq(schema.pages.locale, input.locale),
      isNull(schema.pages.deletedAt),
    ),
  });
  if (existing && input.action === 'skip') return { pageId: existing.id, revisionId: null, action: 'skip' };

  const revisionId = randomUUID();
  const { html, hash } = renderMarkdown(input.markdown);
  const result = await db.transaction(async (tx) => {
    let pageId: string;
    let versionNumber = 1;
    if (existing) {
      const versions = await tx
        .select({ value: max(schema.pageRevisions.versionNumber) })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      versionNumber = (versions[0]?.value ?? 0) + 1;
      pageId = existing.id;
    } else {
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: space.id,
          slug: input.path.split('/').at(-1) ?? input.path,
          path: input.path,
          locale: input.locale,
          title: input.title,
          authorId: input.actorUserId,
        })
        .returning({ id: schema.pages.id });
      pageId = page!.id;
    }
    await tx.insert(schema.pageRevisions).values({
      id: revisionId,
      pageId,
      versionNumber,
      locale: input.locale,
      contentType: 'text/markdown',
      contentSource: input.markdown,
      contentHtml: html,
      contentHash: hash,
      authorId: input.actorUserId,
      status: 'published',
      publishedAt: new Date(),
    });
    await syncRevisionAssetRefs(tx, revisionId, input.markdown);
    await addReplicationTasks(tx, 'markdown', revisionId, hash);
    await tx
      .update(schema.pages)
      .set({
        title: input.title,
        currentPublishedVersionId: revisionId,
        latestVersionId: revisionId,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, pageId));
    return pageId;
  });
  await kickReplication();
  await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(result, buildUserCtx(input.actorUserId, 'admin'));
  return { pageId: result, revisionId, action: existing ? 'replace' : 'create' };
}
