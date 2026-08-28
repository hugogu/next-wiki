import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import entry from '../src/index';

describe('bridge plugin entry', () => {
  it('loads the manifest contract and registers no exclusive memory slot', async () => {
    const manifest = JSON.parse(await readFile(new URL('../openclaw.plugin.json', import.meta.url), 'utf8')) as { id: string; entry: string; contracts: { tools: string[] } };
    expect(manifest.id).toBe('next-wiki-memory-bridge');
    expect(manifest.entry).toBe('./dist/index.js');
    expect(manifest.contracts.tools).toContain('next_wiki_memory_search');
    const hooks: string[] = [];
    const tools: string[] = [];
    await entry({
      config: { wikiApiBaseUrl: 'https://wiki.example.test/api/v2/memory', credential: { value: 'secret' } },
      registerService: () => undefined,
      registerHook: (name) => hooks.push(name),
      registerTool: (name) => tools.push(name),
    });
    expect(tools).toEqual(expect.arrayContaining(['next_wiki_memory_search', 'next_wiki_memory_save', 'next_wiki_memory_forget', 'next_wiki_memory_status']));
    expect(hooks).not.toContain('memory');
  });
});
