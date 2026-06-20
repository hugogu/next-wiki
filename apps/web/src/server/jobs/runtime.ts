import type { PgBoss, SendOptions } from 'pg-boss';

/** Queue names for the storage subsystem's background jobs (explicit — P9). */
export const QUEUES = {
  migration: 'content-migration',
  storageCleanup: 'storage-cleanup',
  orphanCleanup: 'orphan-cleanup',
  replication: 'storage-replication',
  gitExport: 'git-export',
} as const;

/**
 * Thin queue facade. The boot bootstrap sets the started pg-boss instance here
 * once; route handlers enqueue through it. When unset (tests, build, or a
 * worker that failed to start) enqueue is a safe no-op so request handling never
 * depends on the worker being up.
 *
 * The instance is held on `globalThis` because Next.js bundles instrumentation
 * and route handlers separately — a plain module-level variable would not be
 * shared between them, leaving routes unable to enqueue.
 */
const BOSS_KEY = Symbol.for('next-wiki.pgboss');
type BossGlobal = typeof globalThis & { [BOSS_KEY]?: PgBoss | null };

export function setBoss(instance: PgBoss | null): void {
  (globalThis as BossGlobal)[BOSS_KEY] = instance;
}

export function getBoss(): PgBoss | null {
  return (globalThis as BossGlobal)[BOSS_KEY] ?? null;
}

export async function enqueue(
  queue: string,
  data: Record<string, unknown>,
  options?: SendOptions,
): Promise<string | null> {
  const boss = getBoss();
  if (!boss) return null;
  return boss.send(queue, data, options);
}
