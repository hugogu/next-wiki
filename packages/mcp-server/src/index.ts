import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WikiApiClient } from './api-client';
import { createWikiMcpServer } from './server';

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const baseUrl = getEnv('NEXT_WIKI_API_URL');
  const apiKey = getEnv('NEXT_WIKI_API_KEY');

  const client = new WikiApiClient(baseUrl, apiKey);
  const server = createWikiMcpServer(client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP Server failed to start:', error);
  process.exit(1);
});
