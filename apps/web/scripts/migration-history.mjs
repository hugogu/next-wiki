export const LEGACY_MIGRATION_HISTORY = {
  count: 44,
  last: {
    createdAt: 1785319580109,
    hash: '55642c850b22baa39aaf88fd1135608443216ced4142cf204671a930cef99812',
  },
};

function matchesMigration(row, migration) {
  return Number(row.createdAt) === migration.createdAt && row.hash === migration.hash;
}

/**
 * The squashed baseline is only safe after every legacy migration has applied.
 * Keep this policy independent of the database client so it can be tested.
 */
export function classifyMigrationHistory(rows, initMigration) {
  if (rows.length === 0) return 'empty';

  const [first] = rows;
  if (matchesMigration(first, initMigration)) return 'current';

  const latest = rows.at(-1);

  if (
    rows.length === LEGACY_MIGRATION_HISTORY.count &&
    matchesMigration(latest, LEGACY_MIGRATION_HISTORY.last)
  ) {
    return 'legacy';
  }

  throw new Error(
    'Drizzle migration history is neither the complete pre-squash history nor the squashed init baseline. ' +
      'Upgrade with the pre-squash release until migration 0043 is applied before retrying.',
  );
}
