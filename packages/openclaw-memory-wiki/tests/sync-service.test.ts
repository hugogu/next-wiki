import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SyncService } from '../src/sync-service.js';

describe('SyncService', () => {
  it('serializes a complete inventory and records restart-safe progress', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'next-wiki-sync-'));
    const vault = join(parent, 'vault');
    await mkdir(vault);
    await writeFile(join(vault, 'AGENTS.md'), '# Alex\n');
    const client = { mirror: vi.fn(async (_document: { sourcePath: string; content: string; sourceDigest: string; idempotencyKey: string }) => ({ outcome: 'created', sourcePath: 'AGENTS.md', pageId: 'p', revisionId: 'r' })) };
    const service = new SyncService(vault, client as never, 60);

    await expect(service.run()).resolves.toMatchObject({ state: 'idle', scanned: 1, uploaded: 1, unchanged: 0, failed: 0, skipped: 0 });
    expect(client.mirror).toHaveBeenCalledTimes(1);
    // The mirror payload must carry only the fields the server schema accepts —
    // scanner-internal metadata such as sizeBytes is rejected with 422.
    expect(client.mirror.mock.calls[0]?.[0]).toEqual({
      sourcePath: 'AGENTS.md',
      content: '# Alex\n',
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown as string,
      idempotencyKey: expect.stringMatching(/^AGENTS\.md:[a-f0-9]{64}$/) as unknown as string,
    });
    const journal = JSON.parse(await readFile(join(parent, '.openclaw-wiki-next-wiki-sync.json'), 'utf8')) as { completed: Record<string, string> };
    expect(journal.completed['AGENTS.md']).toMatch(/^[a-f0-9]{64}$/);

    client.mirror.mockResolvedValue({ outcome: 'unchanged', sourcePath: 'AGENTS.md', pageId: 'p', revisionId: 'r' });
    const restarted = new SyncService(vault, client as never, 60);
    await expect(restarted.run()).resolves.toMatchObject({ state: 'idle', scanned: 1, uploaded: 0, unchanged: 1, failed: 0 });
    expect(client.mirror).toHaveBeenCalledTimes(1);
  });

  it('replays an existing journal once after a mirror layout migration', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'next-wiki-sync-migration-'));
    const vault = join(parent, 'vault');
    await mkdir(vault);
    await writeFile(join(vault, 'WIKI.md'), '# Wiki\n');
    const client = { mirror: vi.fn(async () => ({ outcome: 'created', sourcePath: 'WIKI.md', pageId: 'p', revisionId: 'r' })) };
    const service = new SyncService(vault, client as never, 60);

    await service.run();
    const journalPath = join(parent, '.openclaw-wiki-next-wiki-sync.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as Record<string, unknown>;
    delete journal.version;
    await writeFile(journalPath, JSON.stringify(journal));

    client.mirror.mockResolvedValue({ outcome: 'unchanged', sourcePath: 'WIKI.md', pageId: 'p', revisionId: 'r' });
    await expect(new SyncService(vault, client as never, 60).run()).resolves.toMatchObject({ uploaded: 0, unchanged: 1 });
    expect(client.mirror).toHaveBeenCalledTimes(2);
  });

  it('does not replay successful migration entries after a partial failure', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'next-wiki-sync-migration-failure-'));
    const vault = join(parent, 'vault');
    await mkdir(vault);
    await writeFile(join(vault, 'a.md'), '# A\n');
    await writeFile(join(vault, 'b.md'), '# B\n');
    let shouldFailB = true;
    const client = {
      mirror: vi.fn(async (document: { sourcePath: string }) => {
        if (document.sourcePath === 'b.md' && shouldFailB) throw new Error('temporary failure');
        return { outcome: 'created', sourcePath: document.sourcePath, pageId: 'p', revisionId: 'r' };
      }),
    };
    const journalPath = join(parent, '.openclaw-wiki-next-wiki-sync.json');
    await writeFile(journalPath, JSON.stringify({ version: 1, completed: {} }));
    const service = new SyncService(vault, client as never, 60);

    await expect(service.run()).resolves.toMatchObject({ state: 'degraded', uploaded: 1, failed: 1 });
    shouldFailB = false;
    await expect(service.run()).resolves.toMatchObject({ state: 'idle', uploaded: 1, unchanged: 1, failed: 0 });
    expect(client.mirror).toHaveBeenCalledTimes(3);
    expect(client.mirror.mock.calls.map(([document]) => document.sourcePath)).toEqual(['a.md', 'b.md', 'b.md']);
  });

  it('enters degraded state without claiming failed writes succeeded', async () => {
    const vault = await mkdtemp(join(tmpdir(), 'next-wiki-sync-failure-'));
    await writeFile(join(vault, 'WIKI.md'), '# Wiki\n');
    const error = Object.assign(new Error('unavailable'), { retryable: false });
    const client = { mirror: vi.fn(async () => { throw error; }) };
    const service = new SyncService(vault, client as never, 60);

    await expect(service.run()).resolves.toMatchObject({ state: 'degraded', scanned: 1, uploaded: 0, unchanged: 0, failed: 1 });
    expect(service.getStatus().lastError).toBe('unavailable');
  });

  it('reports scan-level failures instead of hanging silent', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'next-wiki-sync-scanfail-'));
    const vaultAsFile = join(parent, 'vault.md');
    await writeFile(vaultAsFile, '# not a directory\n');
    const client = { mirror: vi.fn() };
    const service = new SyncService(vaultAsFile, client as never, 60);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(service.run()).resolves.toMatchObject({ state: 'degraded', lastError: 'vault_scan_failed' });
      expect(errorLog).toHaveBeenCalledWith('[next-wiki-memory-wiki] sync run failed:', expect.anything());
    } finally {
      errorLog.mockRestore();
    }
    expect(client.mirror).not.toHaveBeenCalled();
  });

  it('counts skipped oversized files without failing the run', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'next-wiki-sync-skip-'));
    const vault = join(parent, 'vault');
    await mkdir(vault);
    await writeFile(join(vault, 'small.md'), '# Small\n');
    await writeFile(join(vault, 'huge.md'), `# Huge\n\n${'x'.repeat(520_000)}\n`);
    const client = { mirror: vi.fn(async () => ({ outcome: 'created', sourcePath: 'small.md', pageId: 'p', revisionId: 'r' })) };
    const service = new SyncService(vault, client as never, 60);

    await expect(service.run()).resolves.toMatchObject({ state: 'idle', scanned: 1, uploaded: 1, skipped: 1, failed: 0 });
    expect(client.mirror).toHaveBeenCalledTimes(1);
  });

  it('retries a changed document after a previously completed digest', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'next-wiki-sync-change-'));
    const vault = join(parent, 'vault');
    await mkdir(vault);
    const path = join(vault, 'WIKI.md');
    await writeFile(path, '# First\n');
    const client = { mirror: vi.fn(async () => ({ outcome: 'created', sourcePath: 'WIKI.md', pageId: 'p', revisionId: 'r' })) };
    const service = new SyncService(vault, client as never, 60);

    await service.run();
    await writeFile(path, '# Second\n');
    client.mirror.mockResolvedValue({ outcome: 'updated', sourcePath: 'WIKI.md', pageId: 'p', revisionId: 'r2' });

    await expect(service.run()).resolves.toMatchObject({ state: 'idle', scanned: 1, uploaded: 1, unchanged: 0, failed: 0 });
    expect(client.mirror).toHaveBeenCalledTimes(2);
  });

  it('logs a successful sync complete line with scanned/uploaded/unchanged/failed/skipped counts', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'next-wiki-sync-log-'));
    const vault = join(parent, 'vault');
    await mkdir(vault);
    await writeFile(join(vault, 'a.md'), '# A\n');
    const client = { mirror: vi.fn(async () => ({ outcome: 'created', sourcePath: 'a.md', pageId: 'p', revisionId: 'r' })) };
    const service = new SyncService(vault, client as never, 60);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await service.run();
      const messages = logSpy.mock.calls.map((c) => String(c[0]));
      const complete = messages.find((m) => m.includes('[next-wiki-memory-wiki] sync complete:'));
      expect(complete).toBeDefined();
      expect(complete).toContain('scanned=1');
      expect(complete).toContain('uploaded=1');
      expect(complete).toContain('unchanged=0');
      expect(complete).toContain('failed=0');
      expect(complete).toContain('skipped=0');
    } finally {
      logSpy.mockRestore();
    }
  });
});
