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

    await mcpClient.close();
    await server.close();
  });
});
