import { randomUUID } from 'node:crypto';
import { eq, and, isNull, desc, max, count } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx, getActorUserId } from '@/server/permissions';
import { renderMarkdown } from '@/server/pipeline';
import { DomainError } from '@/server/errors';
import { syncRevisionAssetRefs } from '@/server/services/content-assets';
import { assertNotMigrating } from '@/server/services/migration';
import { pathSchema } from '@next-wiki/shared';
import type { LivePage, PageSummary, EditableView, RevisionSummary, RevisionView } from '@next-wiki/shared';
import { addReplicationTasks, kickReplication } from '@/server/services/storage-replication';
import {
  readMarkdownFromDatabase,
  readMarkdownWithFallback,
} from '@/server/content-store/read-router';
import { enqueueGitExport } from '@/server/services/git-export';
import { reconcilePageAcrossIndexes } from '@/server/services/ai-index';

const DEFAULT_SPACE_SLUG = 'default';

async function getDefaultSpace() {
  return db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
}

function getUserId(ctx: PermCtx): string | null {
  return getActorUserId(ctx);
}

function leafSlugFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Pre-generate a revision id and route the raw Markdown to the active content
 * store. The Database backend keeps markdown inline in `content_source`; an
 * external backend (Local/S3) is written external-first (before the DB row is
 * committed) and leaves `content_source` null (plan D1/D9, R11).
 */
/** Resolve legacy externally stored Markdown; new revisions are always authoritative in DB. */
async function readRevisionMarkdown(revision: {
  id: string;
  contentSource: string | null;
  contentHash: string;
}): Promise<string> {
  return readMarkdownWithFallback(revision);
}

export interface ListPublishedOptions {
  /** Cap the number of rows returned. Omit for the full list. */
  limit?: number;
  /** Skip this many rows (for paging). Omit to start at the first row. */
  offset?: number;
  /**
   * `path` (default) keeps the stable alphabetical order used by navigation;
   * `recent` returns the most recently published pages first.
   */
  order?: 'path' | 'recent';
}

export async function listPublished(
  ctx: PermCtx,
  options: ListPublishedOptions = {},
): Promise<PageSummary[]> {
  const space = await getDefaultSpace();
  if (!space) return [];

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return [];
  }

  const query = db
    .select({
      path: schema.pages.path,
      title: schema.pages.title,
      authorDisplayName: schema.users.displayName,
      publishedAt: schema.pageRevisions.publishedAt,
      updatedAt: schema.pages.updatedAt,
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .innerJoin(schema.users, eq(schema.pages.authorId, schema.users.id))
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
      ),
    )
    .orderBy(
      options.order === 'recent' ? desc(schema.pageRevisions.publishedAt) : schema.pages.path,
    )
    .$dynamic();

  const limited = options.limit != null ? query.limit(options.limit) : query;
  const paged = options.offset != null ? limited.offset(options.offset) : limited;
  const rows = await paged;

  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    authorDisplayName: r.authorDisplayName,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Total number of published pages in the default space, mirroring `listPublished`'s filter. */
export async function countPublished(ctx: PermCtx): Promise<number> {
  const space = await getDefaultSpace();
  if (!space) return 0;

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return 0;
  }

  const [row] = await db
    .select({ value: count() })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(
      and(
        eq(schema.pages.spaceId, space.id),
        isNull(schema.pages.deletedAt),
      ),
    );

  return row?.value ?? 0;
}

export async function getLive(ctx: PermCtx, path: string): Promise<LivePage | null> {
  const space = await getDefaultSpace();
  if (!space) return null;

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return null;
  }

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return null;

  const userId = getUserId(ctx);
  const isAuthor = userId ? page.authorId === userId : false;

  if (page.currentPublishedVersionId) {
    const revision = await db.query.pageRevisions.findFirst({
      where: eq(schema.pageRevisions.id, page.currentPublishedVersionId),
    });
    if (!revision) return null;

    const author = await db.query.users.findFirst({
      where: eq(schema.users.id, page.authorId),
    });

    return {
      pageId: page.id,
      revisionId: revision.id,
      path: page.path,
      title: page.title,
      contentHtml: revision.contentHtml,
      contentHash: revision.contentHash,
      version: revision.versionNumber,
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      authorDisplayName: author?.displayName ?? null,
      authorId: page.authorId,
      status: 'published',
      createdAt: page.createdAt.toISOString(),
    };
  }

  if (!can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, { isAuthor })) {
    return null;
  }

  if (!page.latestVersionId) return null;

  const draft = await db.query.pageRevisions.findFirst({
    where: eq(schema.pageRevisions.id, page.latestVersionId),
  });
  if (!draft) return null;

  const author = await db.query.users.findFirst({
    where: eq(schema.users.id, page.authorId),
  });

  return {
    pageId: page.id,
    revisionId: draft.id,
    path: page.path,
    title: page.title,
    contentHtml: draft.contentHtml,
    contentHash: draft.contentHash,
    version: draft.versionNumber,
    publishedAt: null,
    authorDisplayName: author?.displayName ?? null,
    authorId: page.authorId,
    status: 'draft',
    createdAt: page.createdAt.toISOString(),
  };
}

export async function getById(ctx: PermCtx, pageId: string): Promise<LivePage | null> {
  const space = await getDefaultSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.id, pageId),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return null;
  return getLive(ctx, page.path);
}

/**
 * Returns true if the caller is allowed to create pages in the default space.
 */
export async function canCreate(ctx: PermCtx): Promise<boolean> {
  const space = await getDefaultSpace();
  if (!space) return false;
  return can(ctx, 'create', { kind: 'page_list' });
}

export async function remove(ctx: PermCtx, path: string): Promise<void> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to delete pages');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

  const isAuthor = page.authorId === userId;
  if (!can(ctx, 'delete', { kind: 'page', pageId: page.id }, { isAuthor })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to delete this page');
  }

  await db
    .update(schema.pages)
    .set({ deletedAt: new Date() })
    .where(eq(schema.pages.id, page.id));
  await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(page.id, ctx);
}

export async function create(
  ctx: PermCtx,
  input: { path: string; title: string; contentSource: string },
): Promise<{ pageId: string; versionId: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to create pages');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  if (!can(ctx, 'create', { kind: 'page_list' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to create pages');
  }

  const pathCheck = pathSchema.safeParse(input.path);
  if (!pathCheck.success) {
    throw new DomainError('BAD_REQUEST', pathCheck.error.issues[0]?.message ?? 'Invalid path');
  }

  await assertNotMigrating();
  const revisionId = randomUUID();

  const created = await db.transaction(async (tx) => {
    const existing = await tx.query.pages.findFirst({
      where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.path, input.path)),
    });
    if (existing) {
      throw new DomainError('CONFLICT', 'A page with this path already exists');
    }

    const { html, hash } = renderMarkdown(input.contentSource);

    const [page] = await tx
      .insert(schema.pages)
      .values({
        spaceId: space.id,
        slug: leafSlugFromPath(input.path),
        path: input.path,
        title: input.title,
        authorId: userId,
      })
      .returning();

    if (!page) throw new Error('Failed to create page');

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: 1,
        contentType: 'text/markdown',
        contentSource: input.contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'draft',
      })
      .returning();

    if (!revision) throw new Error('Failed to create revision');

    await syncRevisionAssetRefs(tx, revision.id, input.contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);

    await tx
      .update(schema.pages)
      .set({ latestVersionId: revision.id })
      .where(eq(schema.pages.id, page.id));

    return { pageId: page.id, versionId: revision.id };
  });
  await kickReplication();
  return created;
}

export async function newDraft(
  ctx: PermCtx,
  path: string,
  input: { title: string; contentSource: string },
): Promise<{ versionId: string; versionNumber: number }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to edit pages');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  await assertNotMigrating();
  const revisionId = randomUUID();

  const created = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, path),
        isNull(schema.pages.deletedAt),
      ),
    });

    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

    if (!can(ctx, 'edit', { kind: 'page', pageId: page.id })) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
    }

    const maxResult = await tx
      .select({ value: max(schema.pageRevisions.versionNumber) })
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, page.id));

    const nextVersion = (maxResult[0]?.value ?? 0) + 1;
    const { html, hash } = renderMarkdown(input.contentSource);

    const [revision] = await tx
      .insert(schema.pageRevisions)
      .values({
        id: revisionId,
        pageId: page.id,
        versionNumber: nextVersion,
        contentType: 'text/markdown',
        contentSource: input.contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: userId,
        status: 'draft',
      })
      .returning();

    if (!revision) throw new Error('Failed to create revision');

    await syncRevisionAssetRefs(tx, revision.id, input.contentSource);
    await addReplicationTasks(tx, 'markdown', revision.id, hash);

    await tx
      .update(schema.pages)
      .set({
        title: input.title,
        latestVersionId: revision.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));

    return { versionId: revision.id, versionNumber: revision.versionNumber };
  });
  await kickReplication();
  return created;
}

export async function updateProperties(
  ctx: PermCtx,
  currentPath: string,
  input: { path: string },
): Promise<{ pageId: string; newPath: string }> {
  const userId = getUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to edit page properties');
  }

  const space = await getDefaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');

  const pathCheck = pathSchema.safeParse(input.path);
  if (!pathCheck.success) {
    throw new DomainError('BAD_REQUEST', pathCheck.error.issues[0]?.message ?? 'Invalid path');
  }

  const result = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({
      where: and(
        eq(schema.pages.spaceId, space.id),
        eq(schema.pages.path, currentPath),
        isNull(schema.pages.deletedAt),
      ),
    });

    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');

    if (!can(ctx, 'edit', { kind: 'page', pageId: page.id })) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
    }

    if (input.path !== currentPath) {
      const existing = await tx.query.pages.findFirst({
        where: and(eq(schema.pages.spaceId, space.id), eq(schema.pages.path, input.path)),
      });
      if (existing) {
        throw new DomainError('CONFLICT', 'A page with this path already exists');
      }
    }

    await tx
      .update(schema.pages)
      .set({
        path: input.path,
        slug: leafSlugFromPath(input.path),
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, page.id));

    return { pageId: page.id, newPath: input.path };
  });
  if (input.path !== currentPath) await enqueueGitExport('publish');
  await reconcilePageAcrossIndexes(result.pageId, ctx);
  return result;
}

export async function getForEdit(ctx: PermCtx, path: string): Promise<EditableView | null> {
  const userId = getUserId(ctx);
  const space = await getDefaultSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return null;

  const isAuthor = userId ? page.authorId === userId : false;
  if (!can(ctx, 'edit', { kind: 'page', pageId: page.id }, { isAuthor })) {
    return null;
  }

  const revision = page.latestVersionId
    ? await db.query.pageRevisions.findFirst({
        where: eq(schema.pageRevisions.id, page.latestVersionId),
      })
    : null;

  if (!revision) return null;

  const isRevisionAuthor = userId ? revision.authorId === userId : false;
  const canPublish = can(
    ctx,
    'publish',
    { kind: 'revision', pageId: page.id, version: revision.versionNumber },
    { isAuthor: isRevisionAuthor },
  );

  return {
    pageId: page.id,
    revisionId: revision.id,
    path: page.path,
    title: page.title,
    // Editing reads the authoritative source directly: blocking the page load
    // on a remote replica (e.g. S3) is not worth it for the small markdown body.
    contentSource: await readMarkdownFromDatabase(revision),
    latestVersion: revision.versionNumber,
    status: revision.status,
    canPublish,
  };
}

export async function getHistory(ctx: PermCtx, path: string): Promise<RevisionSummary[]> {
  const userId = getUserId(ctx);
  const space = await getDefaultSpace();
  if (!space) return [];

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return [];

  const isAuthor = userId ? page.authorId === userId : false;
  const canSeeDrafts = can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version: 0 }, { isAuthor });

  if (!userId) {
    return [];
  }

  const rows = await db
    .select({
      version: schema.pageRevisions.versionNumber,
      status: schema.pageRevisions.status,
      authorId: schema.pageRevisions.authorId,
      authorDisplayName: schema.users.displayName,
      createdAt: schema.pageRevisions.createdAt,
      contentHash: schema.pageRevisions.contentHash,
    })
    .from(schema.pageRevisions)
    .innerJoin(schema.users, eq(schema.pageRevisions.authorId, schema.users.id))
    .where(eq(schema.pageRevisions.pageId, page.id))
    .orderBy(desc(schema.pageRevisions.versionNumber));

  return rows
    .filter((r) => canSeeDrafts || r.status === 'published')
    .map((r) => {
      const isAuthor = userId ? r.authorId === userId : false;
      const canPublish = can(
        ctx,
        'publish',
        { kind: 'revision', pageId: page.id, version: r.version },
        { isAuthor },
      );

      return {
        version: r.version,
        status: r.status,
        authorDisplayName: r.authorDisplayName,
        createdAt: r.createdAt.toISOString(),
        contentHash: r.contentHash,
        canPublish,
      };
    });
}

export async function getRevision(
  ctx: PermCtx,
  path: string,
  version: number,
): Promise<RevisionView | null> {
  const userId = getUserId(ctx);
  const space = await getDefaultSpace();
  if (!space) return null;

  const page = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, path),
      isNull(schema.pages.deletedAt),
    ),
  });

  if (!page) return null;

  const revision = await db.query.pageRevisions.findFirst({
    where: and(
      eq(schema.pageRevisions.pageId, page.id),
      eq(schema.pageRevisions.versionNumber, version),
    ),
  });

  if (!revision) return null;

  const isAuthor = userId ? revision.authorId === userId : false;
  if (revision.status === 'draft' && !can(ctx, 'read_draft', { kind: 'revision', pageId: page.id, version }, { isAuthor })) {
    return null;
  }

  const author = await db.query.users.findFirst({
    where: eq(schema.users.id, revision.authorId),
  });

  return {
    version: revision.versionNumber,
    status: revision.status,
    contentHtml: revision.contentHtml,
    contentSource: await readRevisionMarkdown(revision),
    authorDisplayName: author?.displayName ?? null,
    createdAt: revision.createdAt.toISOString(),
  };
}
