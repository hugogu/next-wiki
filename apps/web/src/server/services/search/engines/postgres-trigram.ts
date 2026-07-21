import { and, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { EngineDeadlineExceeded } from '../deadline';
import type { SearchCandidate, SearchEngine, SearchEngineQuery } from '../types';
import {
  candidateWindow,
  collectCompletedLexicalWindows,
  likePattern,
  runBoundedLexicalWindow,
  type SearchDbExecutor,
  toLexicalCandidate,
} from './lexical-shared';

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
 * through ILIKE; small textual variations match in scoped titles through the
 * word-similarity operator. Title and content run as separate bounded windows
 * so each predicate stays on its own trigram index
 * (`pages_space_title_trgm_idx`,
 * `page_revisions_content_source_trgm_idx`); the engine merges them locally.
 * It is not a word-segmentation promise.
 */
export function createFuzzyEngine(): SearchEngine {
  return {
    capability: 'fuzzy',
    async run(_ctx, query) {
      try {
        const candidates = await fetchCandidates(query);
        return { state: 'ready', candidates };
      } catch (error) {
        if (error instanceof EngineDeadlineExceeded) return { state: 'timed_out' };
        console.error('fuzzy search engine failed:', error);
        return { state: 'failed' };
      }
    },
  };
}

function publishedScope(spaceIds: readonly string[]) {
  return [
    inArray(schema.pages.spaceId, [...spaceIds]),
    isNull(schema.pages.deletedAt),
    isNotNull(schema.pages.currentPublishedVersionId),
  ] as const;
}

function selection(similarity: ReturnType<typeof sql<number>>, executor: SearchDbExecutor) {
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

/** Title fragment and near matches; predicate matches `pages_space_title_trgm_idx`. */
export function fuzzyTitleQuery(spaceIds: readonly string[], q: string, window: number, executor: SearchDbExecutor = db) {
  const pattern = likePattern(q);
  const similarity = sql<number>`word_similarity(${q}, ${schema.pages.title})`;
  return selection(similarity, executor)
    .where(and(
      ...publishedScope(spaceIds),
      or(
        ilike(schema.pages.title, pattern),
        sql`${q} <% ${schema.pages.title}`,
      )!,
    ))
    .orderBy(sql`similarity desc`, schema.pages.path)
    .limit(window);
}

/**
 * Content fragment matches use the revision trigram index. Near-match scoring
 * intentionally stays title-only: at a Chinese-tolerant similarity floor it
 * matches a large share of long markdown revisions and cannot meet an
 * interactive request budget without sacrificing exact fragment results.
 */
export function fuzzyContentQuery(spaceIds: readonly string[], q: string, window: number, executor: SearchDbExecutor = db) {
  const pattern = likePattern(q);
  const exactMatch = ilike(schema.pageRevisions.contentSource, pattern);
  const similarity = sql<number>`case when ${exactMatch} then 1 else 0 end`;
  return selection(similarity, executor)
    .where(and(
      ...publishedScope(spaceIds),
      exactMatch,
    ))
    .orderBy(sql`similarity desc`, schema.pages.path)
    .limit(window);
}

async function fetchCandidates(query: SearchEngineQuery): Promise<SearchCandidate[]> {
  if (query.spaceIds.length === 0) return [];
  const window = candidateWindow(query.limit);

  const windows = [
    runBoundedLexicalWindow(
      query.deadlineMs,
      (tx) => fuzzyTitleQuery(query.spaceIds, query.q, window, tx),
      { wordSimilarityThreshold: WORD_SIMILARITY_THRESHOLD },
    ),
  ];

  // pg_trgm stores trigrams, so a one- or two-character fragment cannot
  // selectively constrain a revision-content index. The scoped title window
  // remains useful for these queries; skip the unbounded content scan.
  if (hasSelectiveTrigram(query.q)) {
    windows.push(runBoundedLexicalWindow(
      query.deadlineMs,
      (tx) => fuzzyContentQuery(query.spaceIds, query.q, window, tx),
      { preferIndex: true },
    ));
  }

  const rows = (await collectCompletedLexicalWindows(windows)).flat();

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

export function hasSelectiveTrigram(q: string): boolean {
  return Array.from(q.replaceAll(/\s/g, '')).length >= 3;
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
