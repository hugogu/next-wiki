import type { PgBoss } from 'pg-boss';

/** Queue names for the storage subsystem's background jobs (explicit — P9). */
export const QUEUES = {
  migration: 'content-migration',
  storageCleanup: 'storage-cleanup',
  orphanCleanup: 'orphan-cleanup',
} as const;

/**
 * Thin queue facade. The boot bootstrap sets the started pg-boss instance here
 * once; route handlers enqueue through it. When unset (tests, build, or a
 * worker that failed to start) enqueue is a safe no-op so request handling never
 * depends on the worker being up.
 */
let boss: PgBoss | null = null;

export function setBoss(instance: PgBoss | null): void {
  boss = instance;
}

export function getBoss(): PgBoss | null {
  return boss;
}

export async function enqueue(queue: string, data: Record<string, unknown>): Promise<string | null> {
  if (!boss) return null;
  return boss.send(queue, data);
}
