import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import { resetLegacyMigrationHistory } from './reset-migration-history.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(databaseUrl, { prepare: false, max: 1 });
const db = drizzle(client);
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../src/server/db/migrations');

try {
  await resetLegacyMigrationHistory(client);
  await migrate(db, { migrationsFolder });
  console.log('[migrate] Migrations complete');
} catch (err) {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
