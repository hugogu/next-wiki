import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseBridgeConfig, resolveCredential } from '../src/config';
import { normalizeCapture } from '../src/capture';
import { FileOutbox } from '../src/outbox';
import { externalContext } from '../src/prompt-context';
import { registerLifecycleHooks } from '../src/hooks';
import { MemoryBridgeService } from '../src/service';

describe('OpenClaw bridge', () => {
  it('parses strict config and requires a resolved SecretRef value', () => {
    expect(parseBridgeConfig({ wikiApiBaseUrl: 'https://wiki.example.test/api/v2/memory', credential: { value: 'secret' } }).capture.enabled).toBe(false);
    const unresolved = parseBridgeConfig({ wikiApiBaseUrl: 'https://wiki.example.test/api/v2/memory', credential: { ref: 'openclaw://secret' } });
    expect(() => resolveCredential(unresolved.credential)).toThrow();
  });

  it('normalizes only user and assistant messages with deterministic IDs', () => {
    const first = normalizeCapture('agent_end', 'session-a', 'boundary-1', [
      { role: 'system' as never, content: 'do not capture' },
      { role: 'user', content: 'remember this' },
    ]);
    const second = normalizeCapture('agent_end', 'session-a', 'boundary-1', [{ role: 'user', content: 'remember this' }]);
    expect(first.messages).toHaveLength(1);
    expect(first.eventId).toBe(second.eventId);
  });

  it('persists a private outbox without raw query/prompt metadata', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'next-wiki-bridge-'));
    const outbox = new FileOutbox(stateDir, { maxEntries: 4, maxBytes: 10_000, maxAgeSeconds: 3_600 });
    await outbox.open();
    await outbox.enqueue('event-1', { sessionDigest: 'abc', checkpoint: false, messages: [{ role: 'user', content: 'private' }] });
    const raw = await readFile(join(stateDir, 'next-wiki-memory-bridge', 'outbox.json'), 'utf8');
    expect(raw).toContain('private');
    expect(outbox.list()).toHaveLength(1);
  });

  it('fails open when external recall is unavailable', async () => {
    const client = { recall: async () => { throw new Error('offline'); } };
    await expect(externalContext(client as never, 'question', { maxResults: 3, maxCharacters: 500 })).resolves.toBeNull();
  });

  it('recovers an in-flight outbox entry and applies bounded retry state', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'next-wiki-bridge-'));
    const outbox = new FileOutbox(stateDir, { maxEntries: 4, maxBytes: 10_000 });
    await outbox.open();
    await outbox.enqueue('event-1', { value: 'private' });
    await outbox.claim();
    await outbox.open();
    expect(outbox.list()[0]?.state).toBe('retryable');
    await outbox.fail('event-1', 'unreachable');
    expect(outbox.list()[0]?.state).toBe('retryable');
  });

  it('registers lifecycle observation hooks only when capture is enabled', () => {
    const names: string[] = [];
    const api = { registerHook: (name: string) => names.push(name) };
    const config = parseBridgeConfig({ wikiApiBaseUrl: 'https://wiki.example.test/api/v2/memory', credential: { value: 'secret' }, capture: { enabled: true, beforeCompaction: true, sessionEnd: true, agentEnd: true } });
    registerLifecycleHooks(api, config, async () => undefined);
    expect(names).toEqual(expect.arrayContaining(['before_compaction', 'after_compaction', 'agent_end', 'session_end', 'gateway_start', 'gateway_stop']));
  });

  it('continues draining queued captures after shutdown starts', async () => {
    const stateDir = await mkdtemp(join(tmpdir(), 'next-wiki-bridge-'));
    const config = parseBridgeConfig({
      wikiApiBaseUrl: 'https://wiki.example.test/api/v2/memory',
      credential: { value: 'secret' },
      outbox: { maxEntries: 4, maxBytes: 10_000 },
    });
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let calls = 0;
    const client = {
      connection: vi.fn(async () => ({ connectionId: 'connection', agentIdentity: 'agent', displayLabel: 'Agent', state: 'active', capabilities: { recall: true, save: true, forget: true, capture: true } })),
      capture: vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          firstStarted();
          await firstGate;
        }
        return { captureId: `capture-${calls}`, status: 'queued', pollUrl: '/captures', idempotent: false };
      }),
    };
    const service = new MemoryBridgeService(config, client as never, stateDir);

    await service.start();
    await service.enqueue({ eventId: 'event-1', sessionDigest: 'session', checkpoint: false, messages: [{ role: 'user', content: 'one' }] });
    await firstStartedPromise;
    await service.enqueue({ eventId: 'event-2', sessionDigest: 'session', checkpoint: false, messages: [{ role: 'user', content: 'two' }] });

    const stopping = service.stop();
    releaseFirst();
    await stopping;

    expect(client.capture).toHaveBeenCalledTimes(2);
    expect(service.outbox.list().map((entry) => entry.state)).toEqual(['acknowledged', 'acknowledged']);
  });
});
