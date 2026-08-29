import { describe, expect, it } from 'vitest';
import { OUTBOX_BOUNDS, Outbox, OutboxCapacityError, OutboxPayloadTooLargeError, type KeyedStoreLike, type OutboxEntry } from '../src/outbox';

function inMemoryStore(): KeyedStoreLike<OutboxEntry> {
  const map = new Map<string, OutboxEntry>();
  return {
    async register(key, value) {
      map.set(key, value);
    },
    async registerIfAbsent(key, value) {
      if (map.has(key)) return false;
      map.set(key, value);
      return true;
    },
    async update(key, updateValue) {
      const current = map.get(key);
      const next = updateValue(current);
      if (!next) return false;
      map.set(key, next);
      return true;
    },
    async lookup(key) {
      return map.get(key);
    },
    async consume(key) {
      const value = map.get(key);
      map.delete(key);
      return value;
    },
    async delete(key) {
      return map.delete(key);
    },
    async entries() {
      return [...map.entries()].map(([key, value]) => ({ key, value }));
    },
    async clear() {
      map.clear();
    },
  };
}

function entry(overrides: Partial<Pick<OutboxEntry, 'eventId' | 'captureKind' | 'sessionDigest' | 'checkpoint' | 'messages'>> = {}) {
  return {
    eventId: 'event-1',
    captureKind: 'turn' as const,
    sessionDigest: 'a'.repeat(64),
    checkpoint: false,
    messages: [{ role: 'user' as const, content: 'hello' }],
    ...overrides,
  };
}

describe('Outbox', () => {
  it('assigns a deterministic entry a single queued slot on first enqueue', async () => {
    const outbox = new Outbox(inMemoryStore());
    const first = await outbox.enqueue(entry());
    expect(first.queued).toBe(true);
    const deliverable = await outbox.listDeliverable();
    expect(deliverable).toHaveLength(1);
  });

  it('is idempotent: re-enqueuing the same eventId never creates a second entry', async () => {
    const outbox = new Outbox(inMemoryStore());
    await outbox.enqueue(entry());
    const second = await outbox.enqueue(entry());
    expect(second.queued).toBe(false);
    const deliverable = await outbox.listDeliverable();
    expect(deliverable).toHaveLength(1);
  });

  it('rejects a payload larger than the bounded entry size', async () => {
    const outbox = new Outbox(inMemoryStore());
    const oversized = entry({ messages: [{ role: 'user', content: 'x'.repeat(OUTBOX_BOUNDS.maxEntryBytes + 1) }] });
    await expect(outbox.enqueue(oversized)).rejects.toBeInstanceOf(OutboxPayloadTooLargeError);
  });

  it('rejects a new entry once the connection is at its bounded capacity, without evicting a pending one', async () => {
    const store = inMemoryStore();
    const outbox = new Outbox(store);
    for (let index = 0; index < OUTBOX_BOUNDS.maxEntriesPerConnection; index++) {
      await outbox.enqueue(entry({ eventId: `event-${index}` }));
    }
    await expect(outbox.enqueue(entry({ eventId: 'one-too-many' }))).rejects.toBeInstanceOf(OutboxCapacityError);
    const deliverable = await outbox.listDeliverable();
    expect(deliverable).toHaveLength(OUTBOX_BOUNDS.maxEntriesPerConnection);
    expect(deliverable.some((item) => item.eventId === 'event-0')).toBe(true);
  });

  it('schedules a capped exponential backoff with jitter on failure and clears on delivery', async () => {
    const outbox = new Outbox(inMemoryStore());
    await outbox.enqueue(entry());
    const failure = await outbox.recordFailure('event-1');
    expect('retryAt' in failure).toBe(true);
    if ('retryAt' in failure) {
      expect(failure.retryAt).toBeGreaterThan(Date.now());
      expect(failure.retryAt).toBeLessThanOrEqual(Date.now() + OUTBOX_BOUNDS.retryBackoffMaxMs * 1.2);
    }
    await outbox.recordDelivered('event-1');
    expect(await outbox.listDeliverable()).toHaveLength(0);
  });

  it('quarantines a failure for an entry that no longer exists rather than throwing', async () => {
    const outbox = new Outbox(inMemoryStore());
    const result = await outbox.recordFailure('never-enqueued');
    expect(result).toEqual({ quarantined: true });
  });

  it('cancels a pending entry outright', async () => {
    const outbox = new Outbox(inMemoryStore());
    await outbox.enqueue(entry());
    expect(await outbox.cancel('event-1')).toBe(true);
    expect(await outbox.listDeliverable()).toHaveLength(0);
  });

  it('recovers an entry stranded in-flight from a prior crash back to pending', async () => {
    const store = inMemoryStore();
    const outbox = new Outbox(store);
    await outbox.enqueue(entry());
    await outbox.markInFlight('event-1');
    const beforeRecovery = await store.lookup('event-1');
    expect(beforeRecovery?.status).toBe('in_flight');

    const recovered = await outbox.recover();
    expect(recovered.map((item) => item.eventId)).toEqual(['event-1']);
    const afterRecovery = await store.lookup('event-1');
    expect(afterRecovery?.status).toBe('pending');
  });

  it('does not return an entry scheduled for a future retry as deliverable yet', async () => {
    const outbox = new Outbox(inMemoryStore());
    await outbox.enqueue(entry());
    await outbox.recordFailure('event-1');
    expect(await outbox.listDeliverable()).toHaveLength(0);
    expect(await outbox.listDeliverable(Date.now() + OUTBOX_BOUNDS.retryBackoffMaxMs * 1.2)).toHaveLength(1);
  });
});
