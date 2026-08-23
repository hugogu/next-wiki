import { revalidateTag, unstable_cache } from 'next/cache';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { shouldUseDataCache } from '@/server/cache/public-cache';

/** Cache tag for the reserved translation-locale prefix set. */
export const RESERVED_LOCALE_PREFIXES_CACHE_TAG = 'reserved-locale-prefixes';

async function loadReservedLocalePrefixes(): Promise<Set<string>> {
  const rows = await db.select({ code: schema.translationLanguages.code }).from(schema.translationLanguages);
  return new Set(rows.map((row) => row.code));
}

const cachedReservedLocalePrefixes = unstable_cache(
  loadReservedLocalePrefixes,
  [RESERVED_LOCALE_PREFIXES_CACHE_TAG],
  { revalidate: 300, tags: [RESERVED_LOCALE_PREFIXES_CACHE_TAG] },
);

/**
 * Returns the set of configured translation-language codes. The reader route
 * and address namespace treat these as reserved locale prefixes; any segment
 * not in this set is available for page addresses.
 */
export async function getReservedLocalePrefixes(): Promise<ReadonlySet<string>> {
  return shouldUseDataCache() ? cachedReservedLocalePrefixes() : loadReservedLocalePrefixes();
}

/** True when `segment` is a configured translation-language code. */
export function isReservedLocalePrefix(
  reservedPrefixes: ReadonlySet<string>,
  segment: string,
): boolean {
  return reservedPrefixes.has(segment);
}

/** Invalidate the cached prefix set after translation-language changes. */
export function invalidateReservedLocalePrefixesCache(): void {
  if (!shouldUseDataCache()) return;
  revalidateTag(RESERVED_LOCALE_PREFIXES_CACHE_TAG, 'max');
}
