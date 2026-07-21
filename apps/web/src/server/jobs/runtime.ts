import type { PgBoss, SendOptions } from 'pg-boss';

/** Queue names for the storage subsystem's background jobs (explicit — P9). */
export const QUEUES = {
  migration: 'content-migration',
  storageCleanup: 'storage-cleanup',
  orphanCleanup: 'orphan-cleanup',
  replication: 'storage-replication',
  gitExport: 'git-export',
  aiAction: 'ai-action',
  // Knowledge-index rebuilds run on a dedicated queue so a bulk import (which
  // reconciles every page) cannot starve interactive AI actions like image
  // generation or text optimization.
  aiIndex: 'ai-index',
  aiCleanup: 'ai-cleanup',
  transferExport: 'transfer-export',
  transferPreview: 'transfer-preview',
  transferImport: 'transfer-import',
  transferSourceTest: 'transfer-source-test',
  transferCleanup: 'transfer-cleanup',
  tagMutation: 'tag-mutation',
  // Primes the ISR response for a just-published public document. Keeping it
  // separate prevents an unreachable local app listener from delaying publish.
  publicPageWarmup: 'public-page-warmup',
  // Dedicated long-running queue for AI page translation so a bulk one-language
  // run cannot starve interactive AI actions (questions, optimization, images).
  translation: 'translation',
  // Optional Feishu integration (019): durable outbound message delivery and
  // periodic cleanup. Inert unless the integration is configured.
  feishuDelivery: 'feishu-delivery',
  feishuCleanup: 'feishu-cleanup',
  writingModeSwitch: 'writing-mode-switch',
  // 023: coalesces Wiki AI event append/finish notifications into an
  // idempotent Raw Conversation capture pass. Kept off the interactive
  // ai-action queue so capture work never delays chat streaming.
  rawConversationCapture: 'raw-conversation-capture',
} as const;

/**
 * Per-queue handler-expiry floor. pg-boss's default is 900s (15min), which
 * long-running jobs blow past: a full index rebuild embeds every page (often
 * 30–60+ min), a site export/import walks the whole tree, a full Git snapshot
 * push can stall on a slow remote. When a handler exceeds its expiry, pg-boss
 * marks the job failed AND the worker for that queue stalls and never recovers,
 * cascading until every queue is dead and `getBoss()` resolves null in route
 * handlers ("job queue is unavailable"). Queues not listed keep the 15-min
 * default — interactive/cleanup jobs should fail fast on a stall.
 */
export const QUEUE_EXPIRE_SECONDS: Partial<Record<string, number>> = {
  [QUEUES.aiIndex]: 4 * 60 * 60,
  [QUEUES.transferExport]: 4 * 60 * 60,
  [QUEUES.transferImport]: 4 * 60 * 60,
  [QUEUES.migration]: 4 * 60 * 60,
  [QUEUES.gitExport]: 60 * 60,
  [QUEUES.translation]: 4 * 60 * 60,
  [QUEUES.writingModeSwitch]: 4 * 60 * 60,
};

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
