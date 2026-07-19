import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

export type VectorMatch = {
  chunkId: string;
  pageId: string;
  revisionId: string;
  title: string;
  path: string;
  locale: string;
  contentHash: string;
  contentText: string;
  score: number;
  // 022 (Phase 11): the candidate's space + page visibility, so the retrieval
  // permission gate can decide per candidate instead of on one default space.
  spaceSlug: string;
  spaceKind: 'wiki' | 'raw' | 'generated';
  spaceAnonymousRead: boolean;
  visibility: 'public' | 'restricted';
};

export async function exactCosineSearch(
  generationId: string,
  query: number[],
  limit: number,
): Promise<VectorMatch[]> {
  const vector = `[${query.join(',')}]`;
  const rows = await db.execute<{
    chunk_id: string;
    page_id: string;
    revision_id: string;
    title: string;
    path: string;
    locale: string;
    content_hash: string;
    content_text: string;
    score: number | string;
    space_slug: string;
    space_kind: 'wiki' | 'raw' | 'generated';
    space_anonymous_read: boolean;
    visibility: 'public' | 'restricted';
  }>(sql`
    select
      c.id as chunk_id,
      c.page_id,
      c.revision_id,
      p.title,
      p.path,
      p.locale,
      r.content_hash,
      c.content_text,
      1 - (c.embedding <=> ${vector}::vector) as score,
      s.slug as space_slug,
      s.kind as space_kind,
      s.anonymous_read as space_anonymous_read,
      p.visibility
    from ai_knowledge_chunks c
    join pages p on p.id = c.page_id
    join spaces s on s.id = p.space_id
    join page_revisions r on r.id = c.revision_id
    where c.generation_id = ${generationId}
      and p.deleted_at is null
      and p.current_published_version_id = c.revision_id
      and r.status = 'published'
    order by c.embedding <=> ${vector}::vector
    limit ${limit}
  `);
  return rows.map((row) => ({
    chunkId: row.chunk_id,
    pageId: row.page_id,
    revisionId: row.revision_id,
    title: row.title,
    path: row.path,
    locale: row.locale,
    contentHash: row.content_hash,
    contentText: row.content_text,
    score: Number(row.score),
    spaceSlug: row.space_slug,
    spaceKind: row.space_kind,
    spaceAnonymousRead: row.space_anonymous_read,
    visibility: row.visibility,
  }));
}
