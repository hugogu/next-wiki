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
});
