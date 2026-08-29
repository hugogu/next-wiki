import type { CaptureMode } from './config';

/** Matches spec.md "Bounded Limits" exactly; duplicated here (not imported
 * from @next-wiki/shared) because this package is published independently
 * of the private web app workspace. */
export const OUTBOX_BOUNDS = {
  maxEntriesPerConnection: 500,
  maxEntryBytes: 256 * 1024,
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  localDeliveryBudgetMs: 200,
  retryBackoffMinMs: 5_000,
  retryBackoffMaxMs: 10 * 60 * 1000,
} as const;

export type OutboxMessage = { role: 'user' | 'assistant'; content: string };

export type OutboxEntryStatus = 'pending' | 'in_flight' | 'delivered';

export type OutboxEntry = {
  eventId: string;
  captureKind: CaptureMode;
  sessionDigest: string;
  checkpoint: boolean;
  messages: OutboxMessage[];
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  status: OutboxEntryStatus;
};

/** Minimal shape of OpenClaw's `runtime.state.openKeyedStore` result this
 * bridge depends on, confirmed against the real published SDK types. Kept
 * as a local interface (rather than importing the SDK type directly into
 * every module) so outbox logic is unit-testable with a plain in-memory
 * fake, independent of a running OpenClaw Gateway. */
export type KeyedStoreLike<T> = {
  register(key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  registerIfAbsent(key: string, value: T, opts?: { ttlMs?: number }): Promise<boolean>;
  update?(key: string, updateValue: (current: T | undefined) => T | undefined, opts?: { ttlMs?: number }): Promise<boolean>;
  lookup(key: string): Promise<T | undefined>;
  consume(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<Array<{ key: string; value: T }>>;
  clear(): Promise<void>;
};

export class OutboxCapacityError extends Error {}
export class OutboxPayloadTooLargeError extends Error {}

function backoffFor(attempts: number): number {
  const exponential = OUTBOX_BOUNDS.retryBackoffMinMs * 2 ** Math.max(0, attempts - 1);
  const capped = Math.min(exponential, OUTBOX_BOUNDS.retryBackoffMaxMs);
  const jitter = Math.floor(Math.random() * capped * 0.2);
  return capped + jitter;
}

/**
 * Restart-safe local delivery queue. Every mutating operation is a single
 * store call so a crash between "enqueue" and "return" cannot leave a
 * lifecycle hook believing it queued something that was never persisted.
 */
export class Outbox {
  constructor(private readonly store: KeyedStoreLike<OutboxEntry>) {}

  /** Idempotent: re-enqueuing the same deterministic eventId is a no-op. */
  async enqueue(entry: Pick<OutboxEntry, 'eventId' | 'captureKind' | 'sessionDigest' | 'checkpoint' | 'messages'>): Promise<{ queued: boolean }> {
    const payloadBytes = Buffer.byteLength(JSON.stringify(entry.messages), 'utf8');
    if (payloadBytes > OUTBOX_BOUNDS.maxEntryBytes) {
      throw new OutboxPayloadTooLargeError(`outbox entry exceeds ${OUTBOX_BOUNDS.maxEntryBytes} bytes`);
    }
    const existing = await this.store.lookup(entry.eventId);
    if (existing) return { queued: false };

    const { length: currentSize } = await this.store.entries();
    if (currentSize >= OUTBOX_BOUNDS.maxEntriesPerConnection) {
      // Reject rather than silently evict: an already-pending, undelivered
      // capture must never be dropped just because a new one arrived.
      throw new OutboxCapacityError(`local outbox is at its ${OUTBOX_BOUNDS.maxEntriesPerConnection}-entry capacity`);
    }

    const inserted = await this.store.registerIfAbsent(entry.eventId, {
      ...entry,
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      status: 'pending',
    }, { ttlMs: OUTBOX_BOUNDS.ttlMs });
    return { queued: inserted };
  }

  async listDeliverable(now = Date.now()): Promise<OutboxEntry[]> {
    const all = await this.store.entries();
    return all
      .map(({ value }) => value)
      .filter((entry) => entry.status !== 'delivered' && entry.nextAttemptAt <= now);
  }

  async markInFlight(eventId: string): Promise<void> {
    await this.store.update?.(eventId, (current) => (current ? { ...current, status: 'in_flight' } : current), { ttlMs: OUTBOX_BOUNDS.ttlMs });
  }

  /** Delivered: the server has confirmed a durable record. Nothing further to retry. */
  async recordDelivered(eventId: string): Promise<void> {
    await this.store.delete(eventId);
  }

  /** Failed attempt: schedule the next retry with capped exponential backoff and jitter. */
  async recordFailure(eventId: string): Promise<{ retryAt: number } | { quarantined: true }> {
    const current = await this.store.lookup(eventId);
    if (!current) return { quarantined: true };
    const attempts = current.attempts + 1;
    const retryAt = Date.now() + backoffFor(attempts);
    await this.store.update?.(eventId, (curr) => (curr ? { ...curr, attempts, nextAttemptAt: retryAt, status: 'pending' } : curr), { ttlMs: OUTBOX_BOUNDS.ttlMs });
    return { retryAt };
  }

  async cancel(eventId: string): Promise<boolean> {
    return this.store.delete(eventId);
  }

  /** Gateway-start recovery: an entry stuck `in_flight` from a crash mid-delivery goes back to pending. */
  async recover(): Promise<OutboxEntry[]> {
    const all = await this.store.entries();
    const stuck = all.map(({ value }) => value).filter((entry) => entry.status === 'in_flight');
    for (const entry of stuck) {
      await this.store.update?.(entry.eventId, (curr) => (curr ? { ...curr, status: 'pending', nextAttemptAt: Date.now() } : curr), { ttlMs: OUTBOX_BOUNDS.ttlMs });
    }
    return this.listDeliverable();
  }
}
