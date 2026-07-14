import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { EngineDeadlineExceeded, withDeadline } from '../deadline';
import type { SearchCandidate, SearchEngine, SearchEngineQuery } from '../types';
import { candidateWindow, getDefaultSpaceId, toLexicalCandidate } from './lexical-shared';

/**
 * Current `full_text` adapter: PostgreSQL `tsvector` over the exact `simple`
 * expressions indexed by migration 0007. The path/title and content documents
 * are queried separately so each predicate stays on its own GIN index
 * (`pages_keyword_fts_idx`, `page_revisions_content_fts_idx`) instead of
 * degrading into a cross-table OR filter; the engine merges the two bounded
 * windows locally. Term-oriented retrieval only — Chinese fragment and
 * near-text recall belongs to the `fuzzy` capability.
 */
export function createFullTextEngine(): SearchEngine {
  return {
    capability: 'full_text',
    async run(_ctx, query) {
      try {
        const candidates = await withDeadline(fetchCandidates(query), query.deadlineMs);
        return { state: 'ready', candidates };
      } catch (error) {
        if (error instanceof EngineDeadlineExceeded) return { state: 'timed_out' };
        console.error('full_text search engine failed:', error);
        return { state: 'failed' };
      }
    },
  };
}

const tsQueryFor = (q: string) => sql`websearch_to_tsquery('simple', ${q})`;
// These expressions MUST stay byte-identical to the indexed expressions in
// 0007_fast_keyword_search.sql, or PostgreSQL cannot use the GIN indexes.
const pageDocument = () => sql`to_tsvector('simple', coalesce(${schema.pages.path}, '') || ' ' || coalesce(${schema.pages.title}, ''))`;
const contentDocument = () => sql`to_tsvector('simple', coalesce(${schema.pageRevisions.contentSource}, ''))`;

function publishedScope(spaceId: string) {
  return [
    eq(schema.pages.spaceId, spaceId),
    isNull(schema.pages.deletedAt),
    isNotNull(schema.pages.currentPublishedVersionId),
  ] as const;
}

/** Path/title term matches; the predicate matches `pages_keyword_fts_idx`. */
export function fullTextPageQuery(spaceId: string, q: string, window: number) {
  const tsQuery = tsQueryFor(q);
  const rank = sql<number>`ts_rank(${pageDocument()}, ${tsQuery})`;
  return db
    .select({
      pageId: schema.pages.id,
      path: schema.pages.path,
      title: schema.pages.title,
      contentSource: schema.pageRevisions.contentSource,
      rank: rank.as('rank'),
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(and(...publishedScope(spaceId), sql`${pageDocument()} @@ ${tsQuery}`))
    .orderBy(sql`rank desc`, schema.pages.path)
    .limit(window);
}

/** Content term matches; the predicate matches `page_revisions_content_fts_idx`. */
export function fullTextContentQuery(spaceId: string, q: string, window: number) {
  const tsQuery = tsQueryFor(q);
  const rank = sql<number>`ts_rank(${contentDocument()}, ${tsQuery})`;
  return db
    .select({
      pageId: schema.pages.id,
      path: schema.pages.path,
      title: schema.pages.title,
      contentSource: schema.pageRevisions.contentSource,
      rank: rank.as('rank'),
    })
    .from(schema.pages)
    .innerJoin(schema.pageRevisions, eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id))
    .where(and(...publishedScope(spaceId), sql`${contentDocument()} @@ ${tsQuery}`))
    .orderBy(sql`rank desc`, schema.pages.path)
    .limit(window);
}

async function fetchCandidates(query: SearchEngineQuery): Promise<SearchCandidate[]> {
  const spaceId = await getDefaultSpaceId();
  if (!spaceId) return [];
  const window = candidateWindow(query.limit);

  const [pageRows, contentRows] = await Promise.all([
    fullTextPageQuery(spaceId, query.q, window),
    fullTextContentQuery(spaceId, query.q, window),
  ]);

  // Engine-local merge: both windows share the same ts_rank scale; a page
  // matched in both documents keeps its best rank.
  const merged = new Map<string, { pageId: string; path: string; title: string; contentSource: string | null; rank: number }>();
  for (const row of [...pageRows, ...contentRows]) {
    const current = merged.get(row.pageId);
    if (!current || Number(row.rank) > current.rank) {
      merged.set(row.pageId, { ...row, rank: Number(row.rank) });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.rank - a.rank || a.path.localeCompare(b.path))
    .slice(0, window)
    .map((row, index) => toLexicalCandidate(row, index, query.q));
}

