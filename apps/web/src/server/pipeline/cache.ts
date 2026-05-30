import type { RenderResult } from "./index";

// In-memory LRU cache for rendered page output, keyed by revision ID.
// A revision is immutable, so the cache is always valid for a given key.
const MAX_ENTRIES = 500;
const cache = new Map<string, RenderResult>();
const accessOrder: string[] = [];

function evictIfNeeded(): void {
  while (cache.size >= MAX_ENTRIES && accessOrder.length > 0) {
    const oldest = accessOrder.shift()!;
    cache.delete(oldest);
  }
}

export async function getFromCache(revisionId: string): Promise<RenderResult | null> {
  const entry = cache.get(revisionId);
  if (!entry) return null;

  // Move to end of access order (LRU).
  const idx = accessOrder.indexOf(revisionId);
  if (idx !== -1) accessOrder.splice(idx, 1);
  accessOrder.push(revisionId);

  return entry;
}

export async function setInCache(revisionId: string, result: RenderResult): Promise<void> {
  evictIfNeeded();
  cache.set(revisionId, result);
  accessOrder.push(revisionId);
}

export async function invalidateCache(revisionId: string): Promise<void> {
  cache.delete(revisionId);
  const idx = accessOrder.indexOf(revisionId);
  if (idx !== -1) accessOrder.splice(idx, 1);
}
