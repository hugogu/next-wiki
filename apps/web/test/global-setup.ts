import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { TEST_DATABASE_URL, getDatabaseName, assertIsTestDatabase } from './test-db';

/**
 * Vitest global setup: ensure the configured test database exists and is fully
 * migrated before any suite runs. The database is created on demand so a fresh
 * checkout only needs a running Postgres instance.
 */
export default async function setup() {
  assertIsTestDatabase(TEST_DATABASE_URL);

  const dbName = getDatabaseName(TEST_DATABASE_URL);

  // Create the test database if it does not exist yet, via the maintenance
  // "postgres" database (CREATE DATABASE cannot run inside the target db).
  const adminUrl = new URL(TEST_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1 });
  try {
    const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (existing.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  // Apply the same Drizzle migrations the app uses.
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/server/db/migrations',
  );
  const migrationClient = postgres(TEST_DATABASE_URL, { max: 1 });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder });
  } finally {
    await migrationClient.end({ timeout: 5 });
  }
}
