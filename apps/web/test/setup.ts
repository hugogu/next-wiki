import { beforeAll } from 'vitest';
import postgres from 'postgres';
import { assertIsTestDatabase, TEST_DATABASE_URL } from './test-db';

/**
 * Runs inside every test worker before any test. Hard-fails if the worker's
 * DATABASE_URL is not a dedicated `*_test` database, so a misconfigured env can
 * never let the destructive suites truncate development data.
 */
assertIsTestDatabase(process.env.DATABASE_URL ?? '');

/**
 * Every suite shares one Postgres database (the vitest pool is a single fork).
 * Suites historically cleaned only the subset of tables they knew about, so a
 * row left behind by an earlier file — a stray `page_revisions` row, a `tags`
 * row — could break a later file's non-cascading `delete(users)`/`delete(spaces)`
 * with a foreign-key violation. Because vitest's file sequencer is not stable
 * across runs, the victim set shifted every run and the suite was flaky.
 *
 * Reset the whole public schema once before each file so every suite starts
 * from a deterministic clean slate regardless of execution order. TRUNCATE …
 * CASCADE clears dependent tables transitively, and the table list is read from
 * the catalog so new tables are covered automatically. Suites still seed the
 * baseline rows they need in their own `beforeAll`/`beforeEach`.
 *
 * A dedicated connection is used rather than `@/server/db` so the reset is
 * immune to the per-file `vi.mock('@/server/db')` that many suites install.
 */
beforeAll(async () => {
  const sql = postgres(TEST_DATABASE_URL, { max: 1 });
  try {
    const rows = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
    `;
    if (rows.length === 0) return;
    const names = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
    await sql.unsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
