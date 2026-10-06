import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WikiApiClient } from './api-client';
import { createWikiMcpServer } from './server';

const PAGE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PAGE = { id: PAGE_ID, path: 'docs/page', slug: 'page', spaceSlug: 'default', title: 'Page', author: {}, links: {} };

type ScalarSchema = { type?: string; minimum?: number };

// Some MCP hosts hand the server `"2"` where the schema says integer 2.
describe('string-spelled scalar arguments', () => {
  let server: ReturnType<typeof createWikiMcpServer>;
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>>;

  beforeEach(async () => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(PAGE)));
    vi.stubGlobal('fetch', fetchMock);
    server = createWikiMcpServer(new WikiApiClient('http://localhost:3000/api/v1', 'test-key'));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'scalar-args', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await client.close();
    await server.close();
  });

  async function run(name: string, args: Record<string, unknown>) {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: { type: string; text?: string }[];
    };
    return { isError: result.isError === true, text: result.content?.find((block) => block.type === 'text')?.text ?? '' };
  }

  async function validationError(name: string, args: Record<string, unknown>): Promise<string | null> {
    try {
      const { text } = await run(name, args);
      return text.includes('Input validation error') ? text : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return message.includes('Input validation error') ? message : null;
    }
  }

  const requestedUrls = () => fetchMock.mock.calls.map(([url]) => url);

  it.each([2, '2'])('publish_page publishes revision 2 when version is %j', async (version) => {
    const result = await run('publish_page', { pageId: PAGE_ID, version });

    expect(result.isError).toBe(false);
    expect(requestedUrls().map((url) => url.pathname)).toEqual([`/api/v1/pages/${PAGE_ID}/revisions/2/publication`]);
  });

  it('reads the numeric arguments of get_diff and list_revisions from strings', async () => {
    await run('get_diff', { pageId: PAGE_ID, version: '3', against: '2' });
    await run('list_revisions', { pageId: PAGE_ID, limit: '5' });

    const [diff, revisions] = requestedUrls();
    expect(diff?.pathname).toBe(`/api/v1/pages/${PAGE_ID}/revisions/3/diff`);
    expect(diff?.searchParams.get('against')).toBe('2');
    expect(revisions?.searchParams.get('limit')).toBe('5');
  });

  it('forwards a converted number as a JSON number', async () => {
    await run('find_similar', { title: 'Release notes', threshold: '0.25' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ title: 'Release notes', threshold: 0.25 });
  });

  it('reads "true" as a dry run and "false" as the real operation', async () => {
    await run('batch_soft_delete_pages', { pageIds: [PAGE_ID], dryRun: 'true' });
    await run('batch_soft_delete_pages', { pageIds: [PAGE_ID], dryRun: 'false' });

    expect(requestedUrls().map((url) => url.search)).toEqual(['?dry_run=true', '']);
  });

  it('forwards "false" as false, never as true', async () => {
    await run('search_wiki', { query: 'notes', includeAiGenerated: 'false', includeAiAssisted: 'true' });

    const params = requestedUrls()[0]?.searchParams;
    expect(params?.get('includeAiGenerated')).toBe('false');
    expect(params?.get('includeAiAssisted')).toBe('true');
  });

  const unusable: [string, Record<string, unknown>][] = [
    ['publish_page', { pageId: PAGE_ID, version: 'two' }],
    ['publish_page', { pageId: PAGE_ID, version: '' }],
    ['publish_page', { pageId: PAGE_ID, version: '1.5' }],
    ['publish_page', { pageId: PAGE_ID, version: '0' }],
    ['publish_page', { pageId: PAGE_ID, version: null }],
    ['delete_revision', { pageId: PAGE_ID, version: '1x' }],
    ['batch_soft_delete_pages', { pageIds: [PAGE_ID], dryRun: 'yes' }],
    ['batch_soft_delete_pages', { pageIds: [PAGE_ID], dryRun: 'FALSE' }],
    ['batch_soft_delete_pages', { pageIds: [PAGE_ID], dryRun: 0 }],
  ];

  it.each(unusable)('rejects %s %j before calling the API', async (name, args) => {
    expect(await validationError(name, args)).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still advertises integer and boolean types', async () => {
    const { tools } = await client.listTools();
    const publish = tools.find((tool) => tool.name === 'publish_page')?.inputSchema;
    const batchDelete = tools.find((tool) => tool.name === 'batch_soft_delete_pages')?.inputSchema;

    expect(publish?.properties?.version).toMatchObject({ type: 'integer', minimum: 1 });
    expect(publish?.required).toContain('version');
    expect(batchDelete?.properties?.dryRun).toMatchObject({ type: 'boolean' });
    expect(batchDelete?.required).not.toContain('dryRun');
  });

  // Fails when a new tool declares a bare z.number() / z.boolean() instead of
  // numberArg() / booleanArg(). Top-level arguments only.
  it('validates the string spelling of every integer, number and boolean argument like the real value', async () => {
    const { tools } = await client.listTools();
    const offenders: string[] = [];
    let probed = 0;

    for (const tool of tools) {
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, ScalarSchema>;
      for (const [name, schema] of Object.entries(properties)) {
        const spellings: [string, unknown][] =
          schema.type === 'boolean'
            ? [['true', true], ['false', false]]
            : schema.type === 'integer' || schema.type === 'number'
              ? [[String(schema.minimum ?? 1), schema.minimum ?? 1]]
              : [];
        for (const [spelled, real] of spellings) {
          probed += 1;
          const expected = await validationError(tool.name, { [name]: real });
          const actual = await validationError(tool.name, { [name]: spelled });
          if (actual !== expected) offenders.push(`${tool.name}.${name}=${JSON.stringify(spelled)}`);
        }
      }
    }

    expect(probed).toBeGreaterThan(0);
    expect(offenders, 'declare these with numberArg() / booleanArg() from tools/_scalar-args').toEqual([]);
  });
});
