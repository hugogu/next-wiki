import { and, asc, eq, ilike, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { enqueue, QUEUES } from '@/server/jobs/runtime';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { normalizeTagName } from '@/server/metadata/frontmatter';
import { resolveSpace } from '@/server/services/spaces';

async function defaultSpace() {
  return resolveSpace();
}

function assertTagManager(ctx: PermCtx) {
  if (!can(ctx, 'manage_tags', { kind: 'tags' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage tags');
  }
}

function view(tag: typeof schema.tags.$inferSelect) {
  return {
    id: tag.id,
    name: tag.name,
    normalizedName: tag.normalizedName,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

export async function listTags(ctx: PermCtx, input: { q?: string; limit?: number } = {}) {
  const space = await defaultSpace();
  if (!space || !can(ctx, 'read', { kind: 'page_list' }, { anonymousRead: space.anonymousRead })) {
    return { items: [], nextCursor: null };
  }
  const items = await db
    .select()
    .from(schema.tags)
    .where(and(eq(schema.tags.spaceId, space.id), isNull(schema.tags.deletedAt), input.q ? ilike(schema.tags.name, `%${input.q.trim()}%`) : undefined))
    .orderBy(asc(schema.tags.normalizedName))
    .limit(input.limit ?? 20);
  return { items: items.map(view), nextCursor: null };
}

export async function createTag(ctx: PermCtx, name: string) {
  assertTagManager(ctx);
  const space = await defaultSpace();
  if (!space) throw new DomainError('NOT_FOUND', 'Default space not found');
  const normalizedName = normalizeTagName(name);
  if (!normalizedName) throw new DomainError('BAD_REQUEST', 'Tag name cannot be empty');
  const existing = await db.query.tags.findFirst({
    where: and(eq(schema.tags.spaceId, space.id), eq(schema.tags.normalizedName, normalizedName), isNull(schema.tags.deletedAt)),
  });
  if (existing) throw new DomainError('CONFLICT', 'A tag with this name already exists');
  const [tag] = await db.insert(schema.tags).values({ spaceId: space.id, name: name.trim(), normalizedName }).returning();
  if (!tag) throw new Error('Failed to create tag');
  return view(tag);
}

export async function requestTagMutation(ctx: PermCtx, tagId: string, kind: 'rename' | 'delete', requestedName?: string) {
  assertTagManager(ctx);
  const tag = await db.query.tags.findFirst({ where: and(eq(schema.tags.id, tagId), isNull(schema.tags.deletedAt)) });
  if (!tag) throw new DomainError('NOT_FOUND', 'Tag not found');
  const name = requestedName?.trim();
  if (kind === 'rename') {
    const normalizedName = normalizeTagName(name ?? '');
    if (!normalizedName) throw new DomainError('BAD_REQUEST', 'Tag name cannot be empty');
    const duplicate = await db.query.tags.findFirst({
      where: and(eq(schema.tags.spaceId, tag.spaceId), eq(schema.tags.normalizedName, normalizedName), isNull(schema.tags.deletedAt)),
    });
    if (duplicate && duplicate.id !== tag.id) throw new DomainError('CONFLICT', 'A tag with this name already exists');
  }
  const [mutation] = await db.insert(schema.tagMutations).values({
    tagId,
    kind,
    requestedName: kind === 'rename' ? name : null,
    requestedBy: getActorUserId(ctx),
  }).returning();
  if (!mutation) throw new Error('Failed to create tag mutation');
  await enqueue(QUEUES.tagMutation, { mutationId: mutation.id });
  return mutationView(mutation);
}

export async function requestTagMerge(ctx: PermCtx, tagId: string, targetTagId: string) {
  assertTagManager(ctx);
  if (tagId === targetTagId) throw new DomainError('BAD_REQUEST', 'A tag cannot be merged into itself');
  const [tag, target] = await Promise.all([
    db.query.tags.findFirst({ where: and(eq(schema.tags.id, tagId), isNull(schema.tags.deletedAt)) }),
    db.query.tags.findFirst({ where: and(eq(schema.tags.id, targetTagId), isNull(schema.tags.deletedAt)) }),
  ]);
  if (!tag || !target || tag.spaceId !== target.spaceId) throw new DomainError('NOT_FOUND', 'Tag not found');
  const [mutation] = await db.insert(schema.tagMutations).values({
    tagId,
    targetTagId,
    kind: 'merge',
    requestedBy: getActorUserId(ctx),
  }).returning();
  if (!mutation) throw new Error('Failed to create tag mutation');
  await enqueue(QUEUES.tagMutation, { mutationId: mutation.id });
  return mutationView(mutation);
}

export async function getTagMutation(ctx: PermCtx, mutationId: string) {
  const mutation = await db.query.tagMutations.findFirst({ where: eq(schema.tagMutations.id, mutationId) });
  if (!mutation) throw new DomainError('NOT_FOUND', 'Tag mutation not found');
  const actor = getActorUserId(ctx);
  if ((ctx.actor.kind !== 'user' && ctx.actor.kind !== 'api_key') || (ctx.actor.role !== 'admin' && actor !== mutation.requestedBy)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view this tag mutation');
  }
  return mutationView(mutation);
}

export function mutationView(mutation: typeof schema.tagMutations.$inferSelect) {
  return {
    id: mutation.id,
    tagId: mutation.tagId,
    targetTagId: mutation.targetTagId,
    kind: mutation.kind,
    status: mutation.status,
    requestedName: mutation.requestedName,
    affectedPageCount: mutation.affectedPageCount,
    failure: mutation.failure,
    createdAt: mutation.createdAt.toISOString(),
    completedAt: mutation.completedAt?.toISOString() ?? null,
  };
}
