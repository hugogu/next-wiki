import { eq } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { shouldUseDataCache } from '@/server/cache/public-cache';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { DomainError } from '@/server/errors';
import type { PermCtx } from '@/server/permissions';
import { assertRoutePrefixAvailable, effectiveRoutePrefix, normalizeRoutePrefix } from '@/server/services/space-routes';

export const SPACE_CACHE_TAG = 'spaces';
export const DEFAULT_SPACE_SLUG = 'default';

/**
 * Reader/UI-facing alias for the default wiki space. The navigation and page
 * routes address spaces as `wiki | raw | generated` (see `ReaderSpace`), but the
 * default space is persisted with slug `default`. `raw`/`generated` already match
 * their stored slugs; only `wiki` needs mapping back to `default`.
 */
const WIKI_SPACE_ALIAS = 'wiki';

export type SpaceRow = typeof schema.spaces.$inferSelect;
export type SpaceKind = SpaceRow['kind'];
export type SpaceConfiguration = {
  id: string;
  kind: SpaceKind;
  displayName: string;
  routePrefix: string;
  defaultVisibility: 'public' | 'restricted';
};

function defaultVisibility(kind: SpaceKind): 'public' | 'restricted' {
  return kind === 'wiki' ? 'public' : 'restricted';
}

export function getEffectiveDefaultVisibility(space: Pick<SpaceRow, 'kind' | 'defaultVisibility'>): 'public' | 'restricted' {
  return space.defaultVisibility ?? defaultVisibility(space.kind);
}

export function toSpaceConfiguration(space: SpaceRow): SpaceConfiguration {
  return {
    id: space.id,
    kind: space.kind,
    displayName: space.name,
    routePrefix: effectiveRoutePrefix(space),
    defaultVisibility: getEffectiveDefaultVisibility(space),
  };
}

async function findSpaceBySlug(slug: string): Promise<SpaceRow | null> {
  return (await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, slug) })) ?? null;
}

async function findSpaceById(id: string): Promise<SpaceRow | null> {
  return (await db.query.spaces.findFirst({ where: eq(schema.spaces.id, id) })) ?? null;
}

async function findSpacesByKind(kind: SpaceKind): Promise<SpaceRow[]> {
  return db.query.spaces.findMany({ where: eq(schema.spaces.kind, kind) });
}

async function findAllSpaces(): Promise<SpaceRow[]> {
  return db.query.spaces.findMany();
}

const getCachedSpaceBySlug = unstable_cache(
  async (slug: string) => findSpaceBySlug(slug),
  ['space-by-slug'],
  { revalidate: 300, tags: [SPACE_CACHE_TAG] },
);

const getCachedSpaceById = unstable_cache(
  async (id: string) => findSpaceById(id),
  ['space-by-id'],
  { revalidate: 300, tags: [SPACE_CACHE_TAG] },
);

const getCachedSpacesByKind = unstable_cache(
  async (kind: SpaceKind) => findSpacesByKind(kind),
  ['spaces-by-kind'],
  { revalidate: 300, tags: [SPACE_CACHE_TAG] },
);

const getCachedAllSpaces = unstable_cache(async () => findAllSpaces(), ['spaces-all'], {
  revalidate: 300,
  tags: [SPACE_CACHE_TAG],
});

export async function getSpaceBySlug(slug: string): Promise<SpaceRow | null> {
  return shouldUseDataCache() ? getCachedSpaceBySlug(slug) : findSpaceBySlug(slug);
}

export async function getSpaceById(id: string): Promise<SpaceRow | null> {
  return shouldUseDataCache() ? getCachedSpaceById(id) : findSpaceById(id);
}

export async function getSpaceByKind(kind: SpaceKind): Promise<SpaceRow[]> {
  return shouldUseDataCache() ? getCachedSpacesByKind(kind) : findSpacesByKind(kind);
}

export async function listSpaces(): Promise<SpaceRow[]> {
  return shouldUseDataCache() ? getCachedAllSpaces() : findAllSpaces();
}

export async function listSpaceConfigurations(): Promise<SpaceConfiguration[]> {
  return (await listSpaces()).map(toSpaceConfiguration);
}

function requireAdmin(ctx: PermCtx): string {
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You do not have permission to configure spaces');
  }
  return ctx.actor.userId;
}

/** Update presentation-only space settings without changing stable identity. */
export async function updateSpaceConfiguration(
  ctx: PermCtx,
  spaceId: string,
  input: { displayName: string; routePrefix: string; defaultVisibility: 'public' | 'restricted' },
): Promise<SpaceConfiguration> {
  requireAdmin(ctx);
  const displayName = input.displayName.trim();
  if (!displayName) throw new DomainError('BAD_REQUEST', 'A space display name is required.');
  const routePrefix = await assertRoutePrefixAvailable(spaceId, input.routePrefix);

  const updated = await db.transaction(async (tx) => {
    const current = await tx.query.spaces.findFirst({ where: eq(schema.spaces.id, spaceId) });
    if (!current) throw new DomainError('NOT_FOUND', 'Space not found');

    const oldPrefix = effectiveRoutePrefix(current);
    if (oldPrefix !== routePrefix) {
      await tx
        .insert(schema.spaceRouteAliases)
        .values({ spaceId: current.id, prefix: oldPrefix })
        .onConflictDoNothing();
    }
    await tx.delete(schema.spaceRouteAliases).where(
      // A prefix reclaimed by its original space is canonical again, not an
      // alias that can compete with its canonical route.
      eq(schema.spaceRouteAliases.prefix, routePrefix),
    );

    const [space] = await tx
      .update(schema.spaces)
      .set({ name: displayName, routePrefix: normalizeRoutePrefix(routePrefix), defaultVisibility: input.defaultVisibility })
      .where(eq(schema.spaces.id, spaceId))
      .returning();
    if (!space) throw new DomainError('NOT_FOUND', 'Space not found');
    return space;
  });

  invalidateSpaceCache();
  invalidatePublicContentCache();
  return toSpaceConfiguration(updated);
}

/** Resolve a space by slug, or the default space when omitted; null when the slug is unknown. */
export async function resolveSpace(param?: string): Promise<SpaceRow | null> {
  const slug = !param || param === WIKI_SPACE_ALIAS ? DEFAULT_SPACE_SLUG : param;
  return getSpaceBySlug(slug);
}

export function invalidateSpaceCache(): void {
  if (!shouldUseDataCache()) return;
  revalidateTag(SPACE_CACHE_TAG, 'max');
}
