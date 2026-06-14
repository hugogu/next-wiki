import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/server/config';
import * as schema from '@/server/db/schema';

const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'production' ? 20 : 10,
  prepare: false,
});

export const db = drizzle(client, { schema, logger: env.NODE_ENV === 'development' });
export type DB = typeof db;

export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
