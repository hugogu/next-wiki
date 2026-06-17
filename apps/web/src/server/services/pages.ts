import { eq, and, isNull, desc, max } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { renderMarkdown } from '@/server/pipeline';
import { DomainError } from '@/server/errors';
import { pathSchema } from '@next-wiki/shared';
import type { LivePage, PageSummary, EditableView, RevisionSummary, RevisionView } from '@next-wiki/shared';

const DEFAULT_SPACE_SLUG = 'default';

async function getDefaultSpace() {
  return db.query.spaces.findFirst({
    where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG),
  });
}

function getUserId(ctx: PermCtx): string | null {
  return ctx.actor.kind === 'user' ? ctx.actor.userId : null;
}

function leafSlugFromPath(path: string): string {
  return path.split('/').pop() ?? path;
}

export async function listPublished(ctx: PermCtx): Promise<PageSummary[]> {
  const space = await getDefaultSpace();
  if (!space) return [];

  if (!can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return [];
  }

  const rows = await db
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
    .orderBy(schema.pages.path);

  return rows.map((r) => ({
    path: r.path,
    title: r.title,
    authorDisplayName: r.authorDisplayName,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
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
      path: page.path,
      title: page.title,
      contentHtml: revision.contentHtml,
      contentHash: revision.contentHash,
      version: revision.versionNumber,
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      authorDisplayName: author?.displayName ?? null,
      authorId: page.authorId,
      status: 'published',
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
    path: page.path,
    title: page.title,
    contentHtml: draft.contentHtml,
    contentHash: draft.contentHash,
    version: draft.versionNumber,
    publishedAt: null,
    authorDisplayName: author?.displayName ?? null,
    authorId: page.authorId,
    status: 'draft',
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

  return await db.transaction(async (tx) => {
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

    await tx
      .update(schema.pages)
      .set({ latestVersionId: revision.id })
      .where(eq(schema.pages.id, page.id));

    return { pageId: page.id, versionId: revision.id };
  });
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

  return await db.transaction(async (tx) => {
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

  return await db.transaction(async (tx) => {
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
    path: page.path,
    title: page.title,
    contentSource: revision.contentSource,
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
    contentSource: revision.contentSource,
    authorDisplayName: author?.displayName ?? null,
    createdAt: revision.createdAt.toISOString(),
  };
}
