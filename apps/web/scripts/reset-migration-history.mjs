import { readMigrationFiles } from 'drizzle-orm/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyMigrationHistory } from './migration-history.mjs';

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../src/server/db/migrations');
const MIGRATION_HISTORY_LOCK = 1874931023;

function getInitMigration() {
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  if (migrations.length === 0) {
    throw new Error('Expected the squashed init migration, but the migration folder is empty');
  }

  // Drizzle returns files in journal order. The first migration is the fixed
  // squashed baseline; later files must remain available for normal upgrades.
  const [migration] = migrations;
  return {
    createdAt: migration.folderMillis,
    hash: migration.hash,
  };
}

export async function resetLegacyMigrationHistory(client) {
  const existingTable = await client`SELECT to_regclass('drizzle.__drizzle_migrations') AS table_name`;
  if (!existingTable[0]?.table_name) {
    console.log('[migrate] No migration history found; init will be applied to the fresh database');
    return;
  }

  const initMigration = getInitMigration();

  await client.begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(${MIGRATION_HISTORY_LOCK})`;
    const rows = await transaction`
      SELECT hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY created_at
    `;
    const history = rows.map(({ hash, created_at }) => ({ hash, createdAt: Number(created_at) }));
    const state = classifyMigrationHistory(history, initMigration);

    if (state !== 'legacy') return;

    await transaction`DELETE FROM drizzle.__drizzle_migrations`;
    await transaction`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${initMigration.hash}, ${initMigration.createdAt})
    `;
    console.log('[migrate] Replaced complete legacy migration history with squashed init baseline');
  });
}
