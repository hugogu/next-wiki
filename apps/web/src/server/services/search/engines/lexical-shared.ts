import { eq, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildExcerpt } from '../candidate-projection';
import { EngineDeadlineExceeded, isDatabaseDeadline } from '../deadline';
import type { SearchCandidate } from '../types';

const DEFAULT_SPACE_SLUG = 'default';

/** A global database handle or one transaction-bound executor. */
export type SearchDbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

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

type LexicalWindowOptions = {
  /** Avoid an underestimated sequential scan that recalculates long documents. */
  preferIndex?: boolean;
  /** Required by pg_trgm's word-similarity operator for this one transaction. */
  wordSimilarityThreshold?: string;
};

/**
 * Runs one lexical window with PostgreSQL's own cancellation mechanism.
 * A JavaScript race only abandons a promise; `statement_timeout` stops the
 * database work and releases the transaction before the engine reports a timeout.
 */
export async function runBoundedLexicalWindow<T>(
  deadlineMs: number,
  query: (executor: SearchDbExecutor) => PromiseLike<T>,
  options: LexicalWindowOptions = {},
): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('statement_timeout', ${`${deadlineMs}ms`}, true)`);
      if (options.preferIndex) await tx.execute(sql`set local enable_seqscan = off`);
      if (options.wordSimilarityThreshold) {
        await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', ${options.wordSimilarityThreshold}, true)`);
      }
      return query(tx);
    });
  } catch (error) {
    if (isDatabaseDeadline(error)) throw new EngineDeadlineExceeded();
    throw error;
  }
}

/**
 * A title window is useful even when a content window is too expensive. Keep
 * every completed window; report a timeout only when none returned.
 */
export async function collectCompletedLexicalWindows<T>(windows: readonly Promise<T>[]): Promise<Awaited<T>[]> {
  const settled = await Promise.allSettled(windows);
  const completed: Awaited<T>[] = [];
  let failure: unknown;
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      completed.push(result.value);
    } else if (!(result.reason instanceof EngineDeadlineExceeded)) {
      failure ??= result.reason;
    }
  }
  if (completed.length > 0) return completed;
  if (failure) throw failure;
  throw new EngineDeadlineExceeded();
}
