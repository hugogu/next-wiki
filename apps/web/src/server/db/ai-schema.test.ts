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
