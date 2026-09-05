/**
 * Normalize a user-facing Agent Memory identity into one safe Raw tree segment.
 * Keep this shared by ordinary Agent Memory records and file mirrors so every
 * agent integration gets the same readable, path-safe hierarchy.
 */
export function agentMemoryPathSegment(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gu, '')
    .slice(0, 80);
}
