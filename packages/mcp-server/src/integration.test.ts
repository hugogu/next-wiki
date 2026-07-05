import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createWikiMcpServer } from './server';
import { WikiApiClient } from './api-client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('createWikiMcpServer integration', () => {
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

    await mcpClient.close();
    await server.close();
  });
});
