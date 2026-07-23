import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWikiMcpServer } from './server';
import { WikiApiClient } from './api-client';
import { BUILTIN_TOOL_METADATA, getBuiltinToolMetadata } from './tool-metadata';

async function registeredToolNames(): Promise<Set<string>> {
  const server = createWikiMcpServer(new WikiApiClient('http://localhost:3000/api/v1', 'test-key'));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'metadata-test', version: '0.1.0' });
  await client.connect(clientTransport);
  const tools = await client.listTools();
  return new Set(tools.tools.map((tool) => tool.name));
}

describe('built-in tool metadata (026, US6)', () => {
  it('every metadata tool name is a registered MCP tool (vocabulary alignment)', async () => {
    const registered = await registeredToolNames();
    const missing = BUILTIN_TOOL_METADATA.filter((tool) => !registered.has(tool.name)).map((tool) => tool.name);
    expect(missing).toEqual([]);
  });

  it('describes each tool with a category, risk, and description (no implicit fields)', () => {
    for (const tool of BUILTIN_TOOL_METADATA) {
      expect(tool.category).toBeTruthy();
      expect(tool.risk).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate tool names and resolves by name', () => {
    const names = BUILTIN_TOOL_METADATA.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(getBuiltinToolMetadata('search_wiki')?.category).toBe('read');
    expect(getBuiltinToolMetadata('does_not_exist')).toBeUndefined();
  });
});
