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
    const client = { mirror: vi.fn(async () => ({ outcome: 'created', sourcePath: 'AGENTS.md', pageId: 'p', revisionId: 'r' })) };
    const service = new SyncService(vault, client as never, 60);

    await expect(service.run()).resolves.toMatchObject({ state: 'idle', scanned: 1, uploaded: 1, unchanged: 0, failed: 0 });
    expect(client.mirror).toHaveBeenCalledTimes(1);
    const journal = JSON.parse(await readFile(join(parent, '.openclaw-wiki-next-wiki-sync.json'), 'utf8')) as { completed: Record<string, string> };
    expect(journal.completed['AGENTS.md']).toMatch(/^[a-f0-9]{64}$/);

    client.mirror.mockResolvedValue({ outcome: 'unchanged', sourcePath: 'AGENTS.md', pageId: 'p', revisionId: 'r' });
    await expect(service.run()).resolves.toMatchObject({ state: 'idle', scanned: 1, uploaded: 0, unchanged: 1, failed: 0 });
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
});
