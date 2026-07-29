import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { classifyMigrationHistory, LEGACY_MIGRATION_HISTORY } from './migration-history.mjs';

const initMigration = {
  createdAt: 1785326881986,
  hash: 'squashed-init',
};

const initSql = readFileSync(
  new URL('../src/server/db/migrations/0000_init.sql', import.meta.url),
  'utf8',
);

test('allows a fresh database to apply init', () => {
  assert.equal(classifyMigrationHistory([], initMigration), 'empty');
});

test('leaves the squashed baseline unchanged', () => {
  assert.equal(classifyMigrationHistory([initMigration], initMigration), 'current');
});

test('leaves the squashed baseline and later migrations unchanged', () => {
  assert.equal(
    classifyMigrationHistory(
      [initMigration, { createdAt: initMigration.createdAt + 1, hash: 'later-migration' }],
      initMigration,
    ),
    'current',
  );
});

test('recognizes the complete legacy history', () => {
  const rows = Array.from({ length: LEGACY_MIGRATION_HISTORY.count }, (_, index) => ({
    createdAt: index,
    hash: `legacy-${index}`,
  }));
  rows[rows.length - 1] = LEGACY_MIGRATION_HISTORY.last;

  assert.equal(classifyMigrationHistory(rows, initMigration), 'legacy');
});

test('rejects an incomplete legacy history', () => {
  assert.throws(
    () => classifyMigrationHistory([LEGACY_MIGRATION_HISTORY.last], initMigration),
    /neither the complete pre-squash history nor the squashed init baseline/,
  );
});

test('keeps custom search metadata that is not represented in the Drizzle schema', () => {
  for (const statement of [
    'CREATE EXTENSION IF NOT EXISTS vector',
    'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    'CREATE EXTENSION IF NOT EXISTS btree_gin',
    '"pages_keyword_fts_idx"',
    '"page_revisions_content_fts_idx"',
    '"pages_path_trgm_idx"',
    '"pages_title_trgm_idx"',
    '"page_revisions_content_source_trgm_idx"',
    '"pages_space_title_trgm_idx"',
  ]) {
    assert.ok(initSql.includes(statement), `Missing ${statement} from the init migration`);
  }
});
