import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db';
import { EngineDeadlineExceeded } from '../deadline';
import { runBoundedLexicalWindow } from './lexical-shared';

describe('bounded lexical database windows', () => {
  it('cancels a PostgreSQL statement instead of abandoning it in the client', async () => {
    await expect(runBoundedLexicalWindow(25, async (tx) => {
      await tx.execute(sql`select pg_sleep(0.2)`);
      return 'unreachable';
    })).rejects.toBeInstanceOf(EngineDeadlineExceeded);

    // The timed-out transaction rolled back and released its connection, so a
    // follow-up query can run immediately instead of waiting for pg_sleep.
    await expect(db.execute(sql`select 1`)).resolves.toBeDefined();
  });
});

afterAll(async () => {
  await closeDb();
});
