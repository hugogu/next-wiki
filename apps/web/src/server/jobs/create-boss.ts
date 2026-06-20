import { PgBoss } from 'pg-boss';
import { env } from '@/server/config';

/**
 * Construct a pg-boss instance bound to the application database. pg-boss runs
 * inside PostgreSQL (its own `pgboss` schema), so no extra service is required
 * (constitution P1/P6). The instance is created once at boot and injected into
 * registration and the queue facade — application modules never reach for a
 * global singleton (plan D7).
 */
export function createBoss(connectionString: string = env.DATABASE_URL): PgBoss {
  return new PgBoss({ connectionString });
}

export type { PgBoss } from 'pg-boss';
