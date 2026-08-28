import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import entry from '../src/index';

describe('migration plugin entry', () => {
  it('loads its manifest and exposes only explicit one-time tools', async () => {
    const manifest = JSON.parse(await readFile(new URL('../openclaw.plugin.json', import.meta.url), 'utf8')) as { id: string; contracts: { tools: string[] } };
    expect(manifest.id).toBe('next-wiki-memory-migrate');
    expect(manifest.contracts.tools).toEqual(['next_wiki_memory_migrate_preview', 'next_wiki_memory_migrate_run']);
    const tools: string[] = [];
    entry({
      config: { wikiApiBaseUrl: 'https://wiki.example.test/api/v2/memory', credential: { value: 'secret' }, ledgerEncryptionKey: { value: 'ledger-secret' } },
      registerTool: (name) => tools.push(name),
    });
    expect(tools).toEqual(manifest.contracts.tools);
  });
});
