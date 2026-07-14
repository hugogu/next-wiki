import { and, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { EngineDeadlineExceeded, withDeadline } from '../deadline';
import type { SearchCandidate, SearchEngine, SearchEngineQuery } from '../types';
import { candidateWindow, getDefaultSpaceId, likePattern, toLexicalCandidate } from './lexical-shared';

/**
 * Calibrated against the deployed pgvector/pg16 image (en_US.utf8): an exact
 * Chinese fragment inside long content scores ~0.4 word similarity, a
 * one-character variation ~0.2, and unrelated Chinese text 0.0 — so 0.2 keeps
 * near matches while rejecting speculative unrelated pages (spec edge case).
 */
export const WORD_SIMILARITY_THRESHOLD = '0.2';

/**
 * Current `fuzzy` adapter: PostgreSQL `pg_trgm` over the trigram GIN indexes
 * from migration 0007. Contiguous Chinese fragments and substrings match
 * through ILIKE; small textual variations match through the indexable
 * word-similarity operator. Path/title and content run as separate bounded
 * windows so each predicate stays on its own trigram index
 * (`pages_path_trgm_idx`, `pages_title_trgm_idx`,
 * `page_revisions_content_source_trgm_idx`); the engine merges them locally.
 * It is not a word-segmentation promise.
 */
export function createFuzzyEngine(): SearchEngine {
  return {
    capability: 'fuzzy',
    async run(_ctx, query) {
      try {
        const candidates = await withDeadline(fetchCandidates(query), query.deadlineMs);
        return { state: 'ready', candidates };
      } catch (error) {
        if (error instanceof EngineDeadlineExceeded) return { state: 'timed_out' };
        console.error('fuzzy search engine failed:', error);
        return { state: 'failed' };
      }
    },
  };
}

type TrigramDb = Pick<typeof db, 'select'>;

function publishedScope(spaceId: string) {
  return [
    eq(schema.pages.spaceId, spaceId),
    isNull(schema.pages.deletedAt),
    isNotNull(schema.pages.currentPublishedVersionId),
  ] as const;
}

function selection(similarity: ReturnType<typeof sql<number>>, executor: TrigramDb) {
  return executor
    .select({
      pageId: schema.pages.id,
      path: schema.pages.path,
      title: schema.pages.title,
      contentSource: schema.pageRevisions.contentSource,
      similarity: similarity.as('similarity'),
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id));
}

/** Path/title fragment and near matches; predicates match the pages trigram indexes. */
export function fuzzyPageQuery(spaceId: string, q: string, window: number, executor: TrigramDb = db) {
  const pattern = likePattern(q);
  const similarity = sql<number>`greatest(word_similarity(${q}, ${schema.pages.path}), word_similarity(${q}, ${schema.pages.title}))`;
  return selection(similarity, executor)
    .where(and(
      ...publishedScope(spaceId),
      or(
        ilike(schema.pages.path, pattern),
        ilike(schema.pages.title, pattern),
        sql`${q} <% ${schema.pages.path}`,
        sql`${q} <% ${schema.pages.title}`,
      )!,
    ))
    .orderBy(sql`similarity desc`, schema.pages.path)
    .limit(window);
}

/** Content fragment and near matches; predicates match `page_revisions_content_source_trgm_idx`. */
export function fuzzyContentQuery(spaceId: string, q: string, window: number, executor: TrigramDb = db) {
  const pattern = likePattern(q);
  const similarity = sql<number>`word_similarity(${q}, coalesce(${schema.pageRevisions.contentSource}, ''))`;
  return selection(similarity, executor)
    .where(and(
      ...publishedScope(spaceId),
      or(
        ilike(schema.pageRevisions.contentSource, pattern),
        sql`${q} <% ${schema.pageRevisions.contentSource}`,
      )!,
    ))
    .orderBy(sql`similarity desc`, schema.pages.path)
    .limit(window);
}

async function fetchCandidates(query: SearchEngineQuery): Promise<SearchCandidate[]> {
  const spaceId = await getDefaultSpaceId();
  if (!spaceId) return [];
  const window = candidateWindow(query.limit);

  const rows = await db.transaction(async (tx) => {
    // Scope the similarity floor to this transaction; `<%` compares against
    // pg_trgm.word_similarity_threshold and stays index-assisted.
    await tx.execute(sql`select set_config('pg_trgm.word_similarity_threshold', ${WORD_SIMILARITY_THRESHOLD}, true)`);
    const [pageRows, contentRows] = await Promise.all([
      fuzzyPageQuery(spaceId, query.q, window, tx),
      fuzzyContentQuery(spaceId, query.q, window, tx),
    ]);
    return [...pageRows, ...contentRows];
  });

  const merged = new Map<string, { pageId: string; path: string; title: string; contentSource: string | null; similarity: number }>();
  for (const row of rows) {
    const current = merged.get(row.pageId);
    if (!current || Number(row.similarity) > current.similarity) {
      merged.set(row.pageId, { ...row, similarity: Number(row.similarity) });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.similarity - a.similarity || a.path.localeCompare(b.path))
    .slice(0, window)
    .map((row, index) => {
      const candidate = toLexicalCandidate(row, index, query.q);
      return candidate.exact?.term ? candidate : nearMatchCandidate(candidate, row.similarity);
    });
}

/** A near match has no verbatim occurrence: no excerpt evidence, similarity-scaled display relevance. */
function nearMatchCandidate(candidate: SearchCandidate, similarity: number): SearchCandidate {
  return {
    ...candidate,
    excerpt: null,
    field: 'content',
    compatRelevance: Math.min(0.3 + similarity * 0.5, 0.7),
  };
}
