import { eq, not, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { AiContentLevel } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

export type AiSearchIncludes = { includeAiGenerated?: boolean; includeAiAssisted?: boolean };
type AiContentPageColumns = { id: SQLWrapper; nature: SQLWrapper };
// Keep the outer table qualifier inside correlated subqueries. Drizzle strips
// bare Column qualifiers in single-table select projections.
const pageColumns: AiContentPageColumns = {
  id: sql`${schema.pages}.${sql.identifier(schema.pages.id.name)}`,
  nature: sql`${schema.pages}.${sql.identifier(schema.pages.nature.name)}`,
};

export function aiContentLevelSql(page: AiContentPageColumns = pageColumns) {
  const clearedThroughVersion = sql`(select max(ai_clearance.version_number)
    from page_ai_attribution_clearances ai_clearance where ai_clearance.page_id = ${page.id})`;
  // A human declaration covers the content through its recorded revision.
  // Later AI edits add assistance to that human-authored baseline.
  return sql<AiContentLevel | null>`case
    when ${page.nature} <> 'generated' then null
    when ${clearedThroughVersion} is not null then case
      when exists (select 1 from page_revisions ai_later_revision
        where ai_later_revision.page_id = ${page.id}
          and ai_later_revision.actor_kind = 'machine'
          and ai_later_revision.deleted_at is null
          and ai_later_revision.version_number > ${clearedThroughVersion}) then 'assisted'
      else null end
    when exists (select 1 from page_revisions ai_human_revision
      where ai_human_revision.page_id = ${page.id}
        and ai_human_revision.actor_kind = 'human') then 'assisted'
    else 'generated' end`;
}

export function aiContentFilterSql(filters: AiSearchIncludes, page: AiContentPageColumns = pageColumns): SQL | undefined {
  const excluded = [
    ...(filters.includeAiGenerated === false ? ['generated'] : []),
    ...(filters.includeAiAssisted === false ? ['assisted'] : []),
  ];
  if (excluded.length === 0) return undefined;
  return not(sql`coalesce(${aiContentLevelSql(page)}, '') in (${sql.join(excluded.map((level) => sql`${level}`), sql`, `)})`);
}

export async function getAiContentLevel(page: { id: string; nature: 'original' | 'generated' }): Promise<AiContentLevel | null> {
  if (page.nature !== 'generated') return null;
  const [result] = await db.select({ level: aiContentLevelSql() }).from(schema.pages).where(eq(schema.pages.id, page.id));
  return result?.level ?? null;
}
