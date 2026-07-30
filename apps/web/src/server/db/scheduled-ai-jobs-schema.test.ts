import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '@/server/db';

describe('scheduled AI job schema (030)', () => {
  it('creates durable definition and run tables', async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in ('scheduled_ai_jobs', 'scheduled_ai_job_runs')
    `);
    expect(rows.map((row) => row.table_name)).toEqual(expect.arrayContaining(['scheduled_ai_jobs', 'scheduled_ai_job_runs']));
  });

  it('registers scheduled lifecycle enums and action identity', async () => {
    const rows = await db.execute<{ typname: string; label: string }>(sql`
      select t.typname, e.enumlabel as label from pg_type t join pg_enum e on e.enumtypid = t.oid
      where t.typname in ('scheduled_ai_job_status', 'scheduled_ai_job_run_status', 'scheduled_ai_job_trigger', 'ai_action_feature')
    `);
    const has = (type: string, label: string) => rows.some((row) => row.typname === type && row.label === label);
    expect(has('scheduled_ai_job_status', 'enabled')).toBe(true);
    expect(has('scheduled_ai_job_run_status', 'blocked')).toBe(true);
    expect(has('scheduled_ai_job_trigger', 'manual')).toBe(true);
    expect(has('ai_action_feature', 'scheduled_ai_job')).toBe(true);
  });

  it('keeps occurrence and active-run guards plus proposal provenance', async () => {
    const indexes = await db.execute<{ indexname: string }>(sql`
      select indexname from pg_indexes where indexname in (
        'scheduled_ai_job_runs_occurrence_unique', 'scheduled_ai_job_runs_active_job_unique',
        'ai_tool_change_proposals_scheduled_run_idx'
      )
    `);
    expect(indexes.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      'scheduled_ai_job_runs_occurrence_unique',
      'scheduled_ai_job_runs_active_job_unique',
      'ai_tool_change_proposals_scheduled_run_idx',
    ]));
  });
});
