import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMigrationHistory, LEGACY_MIGRATION_HISTORY } from './migration-history.mjs';

const initMigration = {
  createdAt: 1785326881986,
  hash: 'squashed-init',
};

test('allows a fresh database to apply init', () => {
  assert.equal(classifyMigrationHistory([], initMigration), 'empty');
});

test('leaves the squashed baseline unchanged', () => {
  assert.equal(classifyMigrationHistory([initMigration], initMigration), 'current');
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
