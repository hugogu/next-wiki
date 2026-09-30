import { describe, expect, it, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createWikiMcpServer } from './server';
import { WikiApiClient } from './api-client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { wikiMcpToolDescriptions } from '@next-wiki/shared';

describe('createWikiMcpServer integration', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('registers tools and responds to search_wiki call', async () => {
    const client = new WikiApiClient('http://localhost:3000/api/v1', 'test-key');
    const server = createWikiMcpServer(client);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const mcpClient = new Client({ name: 'test-client', version: '0.1.0' });
    await mcpClient.connect(clientTransport);

    const tools = await mcpClient.listTools();
    const toolNames = tools.tools.map((tool) => tool.name);

    expect(toolNames).toContain('search_wiki');
    expect(toolNames).toContain('create_page');
    expect(toolNames).toContain('upload_image');
    expect(toolNames).toContain('submit_semantic_search');
    expect(toolNames).toContain('get_semantic_search_results');
    expect(toolNames).toContain('get_page_outbound_links');
    expect(toolNames).toContain('get_neighborhood');
    expect(toolNames).toContain('batch_update_pages');
    expect(toolNames).toContain('batch_soft_delete_pages');
    expect(toolNames).toContain('delete_folder');
    const descriptions = new Map(tools.tools.map((tool) => [tool.name, tool.description]));
    for (const [name, description] of Object.entries(wikiMcpToolDescriptions)) {
      expect(descriptions.get(name)).toBe(description);
    }

    await mcpClient.close();
    await server.close();
  });
  it('reads a user URL through MCP without listing or searching', async () => {
    const id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const fetchMock = vi.fn(async (input: URL, options?: RequestInit) => {
      expect(input.origin).toBe('https://kb.hugogu.cn');
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer test-key');
      if (input.pathname.endsWith('/addresses')) return new Response(JSON.stringify({ canonical: { address: 'article', url: '/generated/article' }, aliases: [] }));
      expect(input.pathname).toBe('/api/v1/pages/resolve');
      expect(input.searchParams.get('url')).toBe('/generated/ten-theses-ai-future-2026');
      expect(input.searchParams.get('include')).toBe('latestRevision,publishedRevision');
      return new Response(JSON.stringify({ id, path: 'storage/article', slug: 'ten-theses-ai-future-2026', spaceSlug: 'generated', title: 'Article', contentSource: '# Full article', author: {}, links: {} }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const server = createWikiMcpServer(new WikiApiClient('https://kb.hugogu.cn/api/v1', 'test-key'));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'url-reader', version: '1.0.0' });
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({ name: 'get_page', arguments: { url: 'https://kb.hugogu.cn/generated/ten-theses-ai-future-2026?source=chat#section' } });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'text', text: expect.stringContaining('# Full article') })]));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      fetchMock.mockClear();
      const foreign = await client.callTool({ name: 'get_page', arguments: { url: 'https://other.example/wiki/article' } });
      expect(foreign.isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      for (const args of [{}, { pageId: id, url: '/generated/article' }]) {
        const invalid = await client.callTool({ name: 'get_page', arguments: args });
        expect(invalid.isError).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
      }
    } finally {
      await client.close();
      await server.close();
    }
  });

});
