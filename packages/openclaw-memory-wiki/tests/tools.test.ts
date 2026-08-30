import { describe, expect, it, vi } from 'vitest';
import { createTools } from '../src/tools.js';

describe('plugin tools', () => {
  it('exposes bounded search/get and explicit sync operations', async () => {
    const client = { search: vi.fn(async () => ({ results: [] })), get: vi.fn(async () => ({ pageId: 'p' })) };
    const sync = { getStatus: vi.fn(() => ({ state: 'idle' })), run: vi.fn(async () => ({ state: 'idle' })) };
    const tools = createTools(client as never, sync as never);
    await tools.next_wiki_search.execute('id', { query: 'personal context', limit: 3 });
    await tools.next_wiki_get.execute('id', { pageId: 'page-id' });
    expect(client.search).toHaveBeenCalledWith('personal context', 3);
    expect(client.get).toHaveBeenCalledWith('page-id', 8_000);
    expect(tools.next_wiki_status.description).toContain('without content');
  });

  it('keeps synchronization explicit and forwards bounded read options', async () => {
    const client = { search: vi.fn(async () => ({ results: [{ pageId: 'p1' }] })), get: vi.fn(async () => ({ pageId: 'p1', truncated: true })) };
    const sync = { getStatus: vi.fn(() => ({ state: 'idle' })), run: vi.fn(async () => ({ state: 'idle', uploaded: 1 })) };
    const tools = createTools(client as never, sync as never);

    await tools.next_wiki_search.execute('id', { query: 'profile', limit: 20 });
    await tools.next_wiki_get.execute('id', { pageId: 'p1', maxChars: 1200 });
    const syncResult = await tools.next_wiki_sync.execute();

    expect(client.search).toHaveBeenCalledWith('profile', 20);
    expect(client.get).toHaveBeenCalledWith('p1', 1200);
    expect(sync.run).toHaveBeenCalledOnce();
    expect(syncResult.content[0]?.text).toContain('uploaded');
    expect(tools.next_wiki_sync.description).toMatch(/explicit/i);
  });
});
