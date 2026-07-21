import { sql } from 'drizzle-orm';
import { db } from '@/server/db';

describe('system AI schema', () => {
  it('installs pgvector and all AI tables', async () => {
    const extension = await db.execute<{ extname: string }>(sql`select extname from pg_extension where extname = 'vector'`);
    expect(extension).toHaveLength(1);
    const tables = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name like 'ai_%'
    `);
    const names = tables.map((row) => row.table_name);
    expect(names).toEqual(expect.arrayContaining([
      'ai_settings',
      'ai_providers',
      'ai_models',
      'ai_actions',
      'ai_action_inputs',
      'ai_action_events',
      'ai_knowledge_chunks',
    ]));
  });
});

describe('raw conversation search schema (023)', () => {
  it('creates content_data_source_settings with the expected columns and defaults', async () => {
    const columns = await db.execute<{ column_name: string; column_default: string | null; is_nullable: string }>(sql`
      select column_name, column_default, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'content_data_source_settings'
    `);
    const byName = new Map(columns.map((row) => [row.column_name, row]));
    expect(byName.get('source_key')?.is_nullable).toBe('NO');
    expect(byName.get('enabled')?.column_default).toContain('false');
    expect(byName.get('enabled')?.is_nullable).toBe('NO');
    expect(byName.get('config')?.is_nullable).toBe('NO');
    expect(byName.get('updated_by')).toBeDefined();
  });

  it('adds raw_conversation_* pointer/cursor/status columns to ai_actions', async () => {
    const columns = await db.execute<{ column_name: string; column_default: string | null; is_nullable: string }>(sql`
      select column_name, column_default, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'ai_actions'
        and column_name like 'raw_conversation_%'
    `);
    const byName = new Map(columns.map((row) => [row.column_name, row]));
    expect(byName.get('raw_conversation_page_id')?.is_nullable).toBe('YES');
    expect(byName.get('raw_conversation_last_event_id')?.column_default).toContain('0');
    expect(byName.get('raw_conversation_last_event_id')?.is_nullable).toBe('NO');
    expect(byName.get('raw_conversation_capture_status')?.column_default).toContain('not_applicable');
    expect(byName.get('raw_conversation_capture_status')?.is_nullable).toBe('NO');
    expect(byName.get('raw_conversation_capture_error')?.is_nullable).toBe('YES');
  });

  it('indexes ai_actions.raw_conversation_page_id', async () => {
    const indexes = await db.execute<{ indexname: string }>(sql`
      select indexname from pg_indexes where tablename = 'ai_actions' and indexname = 'ai_actions_raw_conversation_page_idx'
    `);
    expect(indexes).toHaveLength(1);
  });

  it('adds a nullable, uniquely-indexed system_key column to raw_categories', async () => {
    const columns = await db.execute<{ column_name: string; is_nullable: string }>(sql`
      select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'raw_categories' and column_name = 'system_key'
    `);
    expect(columns[0]?.is_nullable).toBe('YES');
    const indexes = await db.execute<{ indexname: string }>(sql`
      select indexname from pg_indexes where tablename = 'raw_categories' and indexname = 'raw_categories_system_key_unique'
    `);
    expect(indexes).toHaveLength(1);
  });
});
