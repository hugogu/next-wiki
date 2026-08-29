import { describe, expect, it, vi } from 'vitest';
import { registerCaptureHooks } from '../src/hooks';
import { Outbox, type KeyedStoreLike, type OutboxEntry } from '../src/outbox';
import { CaptureDeliveryService } from '../src/service';
import type { BridgeConfig } from '../src/config';

function inMemoryStore(): KeyedStoreLike<OutboxEntry> {
  const map = new Map<string, OutboxEntry>();
  return {
    async register(key, value) { map.set(key, value); },
    async registerIfAbsent(key, value) {
      if (map.has(key)) return false;
      map.set(key, value);
      return true;
    },
    async update(key, updateValue) {
      const next = updateValue(map.get(key));
      if (!next) return false;
      map.set(key, next);
      return true;
    },
    async lookup(key) { return map.get(key); },
    async consume(key) { const v = map.get(key); map.delete(key); return v; },
    async delete(key) { return map.delete(key); },
    async entries() { return [...map.entries()].map(([key, value]) => ({ key, value })); },
    async clear() { map.clear(); },
  };
}

function stubApi() {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
  return {
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    on: vi.fn((name: string, handler: (event: unknown, ctx: unknown) => void) => { handlers.set(name, handler); }),
    fire(name: string, event: unknown, ctx: unknown = {}) {
      handlers.get(name)?.(event, ctx);
    },
  };
}

const ENABLED_CONFIG: BridgeConfig = {
  wikiApiBaseUrl: 'https://wiki.example.com/api/v1',
  credential: 'nwk_secret',
  capture: { enabled: true, modes: ['turn', 'compaction', 'session_end'] },
  promptEnrichment: { enabled: false },
};

describe('registerCaptureHooks', () => {
  it('registers nothing when capture is disabled', () => {
    const api = stubApi();
    const outbox = new Outbox(inMemoryStore());
    registerCaptureHooks(api as never, { ...ENABLED_CONFIG, capture: { enabled: false, modes: [] } }, outbox);
    expect(api.on).not.toHaveBeenCalled();
  });

  it('enqueues an agent_end turn without waiting on the network', async () => {
    const api = stubApi();
    const outbox = new Outbox(inMemoryStore());
    registerCaptureHooks(api as never, ENABLED_CONFIG, outbox);

    // Firing the hook returns synchronously; only the outbox write is async.
    api.fire('agent_end', { messages: [{ role: 'user', content: 'remember this' }] }, { sessionId: 'session-1' });
    await vi.waitFor(async () => {
      expect(await outbox.listDeliverable()).toHaveLength(1);
    });
  });

  it('safely skips agent_end when the hook context lacks a session id', async () => {
    const api = stubApi();
    const outbox = new Outbox(inMemoryStore());
    registerCaptureHooks(api as never, ENABLED_CONFIG, outbox);

    api.fire('agent_end', { messages: [{ role: 'user', content: 'remember this' }] }, {});
    expect(await outbox.listDeliverable()).toHaveLength(0);
    expect(api.logger.debug).toHaveBeenCalledWith(expect.stringContaining('no session correlation'));
  });

  it('safely skips before_compaction when the event carries no messages', async () => {
    const api = stubApi();
    const outbox = new Outbox(inMemoryStore());
    registerCaptureHooks(api as never, ENABLED_CONFIG, outbox);

    api.fire('before_compaction', { messageCount: 4 }, { sessionId: 'session-1' });
    expect(await outbox.listDeliverable()).toHaveLength(0);
  });

  it('never enqueues from session_end, which carries no content in this SDK version', async () => {
    const api = stubApi();
    const outbox = new Outbox(inMemoryStore());
    registerCaptureHooks(api as never, ENABLED_CONFIG, outbox);

    api.fire('session_end', { sessionId: 'session-1', messageCount: 10, reason: 'shutdown' });
    expect(await outbox.listDeliverable()).toHaveLength(0);
  });

  it('never enqueues from after_compaction, only observes it', async () => {
    const api = stubApi();
    const outbox = new Outbox(inMemoryStore());
    registerCaptureHooks(api as never, ENABLED_CONFIG, outbox);

    api.fire('after_compaction', { messageCount: 4, compactedCount: 2 }, { sessionId: 'session-1' });
    expect(await outbox.listDeliverable()).toHaveLength(0);
  });

  it('does not enqueue a capture kind the operator did not enable', async () => {
    const api = stubApi();
    const outbox = new Outbox(inMemoryStore());
    registerCaptureHooks(api as never, { ...ENABLED_CONFIG, capture: { enabled: true, modes: ['session_end'] } }, outbox);

    api.fire('agent_end', { messages: [{ role: 'user', content: 'x' }] }, { sessionId: 'session-1' });
    expect(await outbox.listDeliverable()).toHaveLength(0);
  });

  it('recovers pending entries on gateway_start', async () => {
    const api = stubApi();
    const store = inMemoryStore();
    const outbox = new Outbox(store);
    await outbox.enqueue({ eventId: 'e1', captureKind: 'turn', sessionDigest: 'a'.repeat(64), checkpoint: false, messages: [{ role: 'user', content: 'x' }] });
    await outbox.markInFlight('e1');
    registerCaptureHooks(api as never, ENABLED_CONFIG, outbox);

    api.fire('gateway_start', { port: 1234 }, {});
    await vi.waitFor(() => {
      expect(api.logger.info).toHaveBeenCalledWith(expect.stringContaining('recovered 1 pending capture'));
    });
  });
});

describe('CaptureDeliveryService start/stop bounds', () => {
  it('stop() resolves within its drain budget even if a delivery never settles', async () => {
    const outbox = new Outbox(inMemoryStore());
    await outbox.enqueue({ eventId: 'e1', captureKind: 'turn', sessionDigest: 'a'.repeat(64), checkpoint: false, messages: [{ role: 'user', content: 'x' }] });
    const hangingClient = { submitEvidence: () => new Promise(() => {}) };
    const service = new CaptureDeliveryService({
      outbox,
      client: hangingClient as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      pollIntervalMs: 100_000,
      stopDrainBudgetMs: 50,
    });

    await service.start();
    const startedAt = Date.now();
    await service.stop();
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it('records a delivered capture and removes it from the outbox', async () => {
    const outbox = new Outbox(inMemoryStore());
    await outbox.enqueue({ eventId: 'e1', captureKind: 'turn', sessionDigest: 'a'.repeat(64), checkpoint: false, messages: [{ role: 'user', content: 'x' }] });
    const client = { submitEvidence: vi.fn().mockResolvedValue({ status: 'durable', captureId: 'e1' }) };
    const service = new CaptureDeliveryService({
      outbox,
      client: client as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      pollIntervalMs: 100_000,
    });

    await service.start();
    // start() is fire-and-forget by design (it must never block on network);
    // wait for the observable delivery outcome before stopping, the same way
    // a real caller would poll rather than assume start() drained inline.
    await vi.waitFor(async () => {
      expect(await outbox.listDeliverable()).toHaveLength(0);
    });
    await service.stop();
    expect(client.submitEvidence).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'e1' }));
  });
});
