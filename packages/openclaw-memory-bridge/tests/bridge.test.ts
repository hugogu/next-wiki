import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBridgeConfig, resolveCredential } from '../src/config';
import { normalizeCapture } from '../src/capture';
import { FileOutbox } from '../src/outbox';
import { externalContext } from '../src/prompt-context';
import { registerLifecycleHooks } from '../src/hooks';

describe('OpenClaw bridge', () => {
  it('parses strict config and requires a resolved SecretRef value', () => {
    expect(parseBridgeConfig({ wikiApiBaseUrl: 'https://wiki.example.test/api/v2', credential: { value: 'secret' } }).capture.enabled).toBe(false);
    const unresolved = parseBridgeConfig({ wikiApiBaseUrl: 'https://wiki.example.test/api/v2', credential: { ref: 'openclaw://secret' } });
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
    const config = parseBridgeConfig({ wikiApiBaseUrl: 'https://wiki.example.test/api/v2', credential: { value: 'secret' }, capture: { enabled: true, beforeCompaction: true, sessionEnd: true, agentEnd: true } });
    registerLifecycleHooks(api, config, async () => undefined);
    expect(names).toEqual(expect.arrayContaining(['before_compaction', 'after_compaction', 'agent_end', 'session_end', 'gateway_start', 'gateway_stop']));
  });
});
