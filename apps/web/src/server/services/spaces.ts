import { eq } from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { shouldUseDataCache } from '@/server/cache/public-cache';

export const SPACE_CACHE_TAG = 'spaces';
export const DEFAULT_SPACE_SLUG = 'default';

export type SpaceRow = typeof schema.spaces.$inferSelect;
export type SpaceKind = SpaceRow['kind'];

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

/** Resolve a space by slug, falling back to the default space. */
export async function resolveSpace(param?: string): Promise<SpaceRow | null> {
  return getSpaceBySlug(param ?? DEFAULT_SPACE_SLUG);
}

export function invalidateSpaceCache(): void {
  if (!shouldUseDataCache()) return;
  revalidateTag(SPACE_CACHE_TAG, 'max');
}
