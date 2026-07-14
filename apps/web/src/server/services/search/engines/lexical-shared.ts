import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildExcerpt } from '../candidate-projection';
import type { SearchCandidate } from '../types';

const DEFAULT_SPACE_SLUG = 'default';

/** Raw-source excerpt evidence window; the coordinator compacts it to settings. */
export const EXCERPT_EVIDENCE_WINDOW = 300;

export async function getDefaultSpaceId(): Promise<string | null> {
  const space = await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, DEFAULT_SPACE_SLUG) });
  return space?.id ?? null;
}

export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
}

export type LexicalRow = {
  pageId: string;
  path: string;
  title: string;
  contentSource: string | null;
};

/**
 * Maps one published-page row to an internal candidate with product-level
 * exact/field evidence and the feature-013 display-relevance heuristic
 * (path > title > content, exact above substring). No index or SQL detail
 * leaves the engine.
 */
export function toLexicalCandidate(row: LexicalRow, rank: number, q: string): SearchCandidate {
  const query = q.toLowerCase();
  const path = row.path.toLowerCase();
  const title = row.title.toLowerCase();
  const content = row.contentSource?.toLowerCase() ?? '';

  const exact = {
    path: path === query,
    title: title === query,
    term: content.includes(query) || path.includes(query) || title.includes(query),
  };
  const field: SearchCandidate['field'] = path.includes(query)
    ? 'path'
    : title.includes(query)
      ? 'title'
      : 'content';

  let compatRelevance: number;
  if (exact.path) compatRelevance = 1;
  else if (field === 'path') compatRelevance = 0.95;
  else if (exact.title) compatRelevance = 0.9;
  else if (field === 'title') compatRelevance = 0.8;
  else compatRelevance = Math.min(0.3 + countOccurrences(content, query) * 0.05, 0.7);

  const excerpt = row.contentSource
    ? buildExcerpt(row.contentSource, q, EXCERPT_EVIDENCE_WINDOW)
      ?? firstTermExcerpt(row.contentSource, q)
    : null;

  return { pageId: row.pageId, rank, excerpt, field, compatRelevance, exact };
}

/** Multi-term queries rarely appear verbatim; center on the first present term. */
function firstTermExcerpt(content: string, q: string): string | null {
  for (const term of q.split(/\s+/).filter(Boolean)) {
    const excerpt = buildExcerpt(content, term, EXCERPT_EVIDENCE_WINDOW);
    if (excerpt) return excerpt;
  }
  return null;
}

/** Bounded per-engine candidate window before permission filtering and fusion. */
export function candidateWindow(limit: number): number {
  return Math.min(Math.max(limit * 2, 20), 50);
}
