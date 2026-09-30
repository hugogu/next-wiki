import { and, eq, not, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { deriveAiContentLevel, type AiContentLevel } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

export type AiSearchIncludes = { includeAiGenerated?: boolean; includeAiAssisted?: boolean };

// Revision authorship is immutable. Once a human has edited generated content,
// subsequent machine edits must not erase that contribution.
type AiContentPageColumns = { id: SQLWrapper; nature: SQLWrapper };

export function aiContentLevelSql(page: AiContentPageColumns = schema.pages) {
  return sql<AiContentLevel | null>`case
    when ${page.nature} <> 'generated' then null
    when exists (select 1 from page_revisions ai_human_revision
      where ai_human_revision.page_id = ${page.id}
        and ai_human_revision.actor_kind = 'human') then 'assisted'
    else 'generated' end`;
}

export function aiContentFilterSql(filters: AiSearchIncludes, page: AiContentPageColumns = schema.pages): SQL | undefined {
  const excluded = [
    ...(filters.includeAiGenerated === false ? ['generated'] : []),
    ...(filters.includeAiAssisted === false ? ['assisted'] : []),
  ];
  if (excluded.length === 0) return undefined;
  // Coalesce retains unmarked human-authored and original Raw evidence pages.
  return not(sql`coalesce(${aiContentLevelSql(page)}, '') in (${sql.join(excluded.map((level) => sql`${level}`), sql`, `)})`);
}

export async function getAiContentLevel(page: { id: string; nature: 'original' | 'generated' }): Promise<AiContentLevel | null> {
  if (page.nature !== 'generated') return null;
  const humanRevision = await db.query.pageRevisions.findFirst({
    where: and(eq(schema.pageRevisions.pageId, page.id), eq(schema.pageRevisions.actorKind, 'human')),
    columns: { id: true },
  });
  return deriveAiContentLevel(page.nature, humanRevision !== undefined);
}
