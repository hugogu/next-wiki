import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { env } from '@/server/config';
import { db } from '.';

export async function runMigrations() {
  if (env.NODE_ENV === 'test') {
    return;
  }
  await migrate(db, { migrationsFolder: 'src/server/db/migrations' });
}
