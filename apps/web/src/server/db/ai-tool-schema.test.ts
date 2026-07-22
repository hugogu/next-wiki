import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

/**
 * Schema regression coverage for the Wiki AI Tool Runtime (026). Asserts the
 * generated migration produced the expected tables, key columns, enum types,
 * and guard constraints so a hand-edited migration or a dropped snapshot can't
 * silently drift from `schema/ai-tools.ts`.
 */
describe('ai tool runtime schema (026)', () => {
  it('creates every ai_tool_* table', async () => {
    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name like 'ai_tool_%'
    `);
    const names = tables.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'ai_tool_providers',
        'ai_tool_policies',
        'ai_tool_workflows',
        'ai_tool_calls',
        'ai_tool_change_proposals',
        'ai_tool_change_proposal_items',
        'ai_tool_evidence_links',
      ]),
    );
  });

  it('registers the new enum types with their labels', async () => {
    const rows = await db.execute<{ typname: string; labels: string[] }>(sql`
      select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      where t.typname in (
        'ai_tool_category', 'ai_tool_review_policy', 'ai_tool_review_decision',
        'ai_tool_workflow_status', 'ai_tool_call_status', 'ai_tool_proposal_status',
        'ai_tool_proposal_kind', 'ai_tool_evidence_target_kind'
      )
      group by t.typname
    `);
    const byName = new Map(rows.map((row) => [row.typname, row.labels]));
    expect(byName.get('ai_tool_category')).toEqual([
      'read',
      'page_draft',
      'metadata',
      'tag',
      'batch',
      'raw_evidence',
    ]);
    expect(byName.get('ai_tool_review_decision')).toEqual(['none', 'admin_review']);
    expect(byName.get('ai_tool_workflow_status')).toEqual([
      'queued',
      'running',
      'waiting_review',
      'completed',
      'failed',
      'cancelled',
      'limit_reached',
    ]);
    expect(byName.get('ai_tool_proposal_kind')).toEqual([
      'tag_update',
      'metadata_update',
      'batch_update',
      'raw_evidence_link',
      'other',
    ]);
    expect(byName.get('ai_tool_evidence_target_kind')).toEqual([
      'page_revision',
      'proposal',
      'tag_mutation',
      'metadata_change',
    ]);
  });

  it('extends existing AI enums with the tool values', async () => {
    const rows = await db.execute<{ typname: string; label: string }>(sql`
      select t.typname, e.enumlabel as label
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typname in ('ai_action_feature', 'ai_capability', 'ai_event_type')
    `);
    const has = (typname: string, label: string) =>
      rows.some((row) => row.typname === typname && row.label === label);
    expect(has('ai_action_feature', 'wiki_tool_chat')).toBe(true);
    expect(has('ai_capability', 'tool_calling')).toBe(true);
    expect(has('ai_event_type', 'tool_call')).toBe(true);
    expect(has('ai_event_type', 'tool_proposal')).toBe(true);
    expect(has('ai_event_type', 'tool_evidence')).toBe(true);
  });

  it('enforces the single-evidence-anchor and policy-bounds check constraints', async () => {
    const constraints = await db.execute<{ conname: string }>(sql`
      select conname from pg_constraint
      where conname in ('ai_tool_evidence_links_anchor', 'ai_tool_policies_bounds')
    `);
    const names = constraints.map((row) => row.conname);
    expect(names).toEqual(
      expect.arrayContaining(['ai_tool_evidence_links_anchor', 'ai_tool_policies_bounds']),
    );
  });

  it('keeps the built-in provider key uniquely indexed', async () => {
    const indexes = await db.execute<{ indexname: string }>(sql`
      select indexname from pg_indexes
      where tablename = 'ai_tool_workflows' and indexname = 'ai_tool_workflows_action_unique'
    `);
    expect(indexes).toHaveLength(1);
  });
});
