import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = postgres(databaseUrl, { prepare: false, max: 1 });
const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder: 'apps/web/src/server/db/migrations' });
  console.log('[migrate] Migrations complete');
} catch (err) {
  console.error('[migrate] Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
