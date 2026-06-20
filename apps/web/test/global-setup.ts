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

  // Teardown: leave the test database empty once the whole run completes, so a
  // finished suite never leaves residue behind. Per-suite `beforeAll` cleanup
  // still guarantees isolation between files during the run.
  return async () => {
    const client = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      await client.unsafe(
        'TRUNCATE TABLE storage_replication_tasks, storage_cleanup_jobs, content_asset_refs, content_blobs, content_assets, content_migrations, storage_backends, api_audit_entries, api_keys, page_revisions, pages, sessions, users, spaces RESTART IDENTITY CASCADE',
      );
    } finally {
      await client.end({ timeout: 5 });
    }
  };
}
