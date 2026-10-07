import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WikiApiClient } from './api-client';
import { createWikiMcpServer } from './server';

const PAGE_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const RESULT = { id: PAGE_ID, path: 'docs/note', slug: 'note', spaceSlug: 'generated', title: 'Note', status: 'draft', version: 2, author: {}, links: {} };
const BODY = '# 长文\n\n正文 — ✓\n';

// A host that caps the size of a tool call cannot send a long page inline, so
// create_page and save_draft can read the body from a file instead.
describe('page body from a file', () => {
  let server: ReturnType<typeof createWikiMcpServer>;
  let client: Client;
  let fetchMock: ReturnType<typeof vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>>;
  let dir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-body-file-'));
    process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS = dir;
    fetchMock = vi.fn(async () => new Response(JSON.stringify(RESULT)));
    vi.stubGlobal('fetch', fetchMock);
    server = createWikiMcpServer(new WikiApiClient('http://localhost:3000/api/v1', 'test-key'));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'body-file', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
    await client.close();
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function note(name = 'note.md', content = BODY) {
    const file = path.join(dir, name);
    await fs.writeFile(file, content);
    return file;
  }

  async function run(name: string, args: Record<string, unknown>) {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: { type: string; text?: string }[];
    };
    return { isError: result.isError === true, text: result.content?.find((block) => block.type === 'text')?.text ?? '' };
  }

  const sentBody = (call = 0) => JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body));
  const createArgs = (extra: Record<string, unknown>) => ({ path: 'docs/note', title: 'Note', ...extra });
  const saveArgs = (extra: Record<string, unknown>) => ({ pageId: PAGE_ID, title: 'Note', ...extra });

  it('advertises filePath on create_page and save_draft only, besides the file upload tools', async () => {
    const { tools } = await client.listTools();
    const withFilePath = tools.filter((tool) => 'filePath' in (tool.inputSchema.properties ?? {})).map((tool) => tool.name);

    expect(withFilePath.sort()).toEqual(['attach_file', 'create_page', 'save_draft', 'upload_image']);
  });

  it('tells the agent the path must be absolute, and that save_draft needs one of the two bodies', async () => {
    const { tools } = await client.listTools();
    const create = tools.find((tool) => tool.name === 'create_page')?.inputSchema;
    const save = tools.find((tool) => tool.name === 'save_draft')?.inputSchema;

    for (const schema of [create, save]) {
      const filePath = schema?.properties?.filePath as { type?: string; description?: string };
      expect(filePath.type).toBe('string');
      expect(filePath.description).toMatch(/Absolute path/);
      expect(filePath.description).toMatch(/"~" and relative paths are not expanded/);
      expect(filePath.description).toMatch(/NEXT_WIKI_MCP_FILE_ALLOW_DIRS/);
    }
    expect(save?.required).toEqual(['pageId', 'title']);
    expect(create?.required).not.toContain('filePath');
  });

  it('create_page creates the page from the file', async () => {
    const result = await run('create_page', createArgs({ filePath: await note() }));

    expect(result.isError).toBe(false);
    expect(fetchMock.mock.calls[0]?.[0].pathname).toBe('/api/v1/pages');
    expect(sentBody()).toMatchObject({ path: 'docs/note', title: 'Note', contentSource: BODY });
  });

  it('save_draft saves the file as a new draft', async () => {
    const result = await run('save_draft', saveArgs({ filePath: await note() }));

    expect(result.isError).toBe(false);
    expect(fetchMock.mock.calls[0]?.[0].pathname).toBe(`/api/v1/pages/${PAGE_ID}/drafts`);
    expect(sentBody()).toEqual({ title: 'Note', contentSource: BODY });
  });

  it('keeps sending an inline contentSource as before', async () => {
    await run('create_page', createArgs({ contentSource: 'inline body' }));
    await run('save_draft', saveArgs({ contentSource: 'inline draft' }));

    expect(sentBody(0).contentSource).toBe('inline body');
    expect(sentBody(1).contentSource).toBe('inline draft');
  });

  it('still lets create_page make a page with no body at all', async () => {
    const result = await run('create_page', createArgs({}));

    expect(result.isError).toBe(false);
    expect(sentBody().contentSource).toBe('');
  });

  it.each([
    ['create_page', createArgs({ contentSource: 'inline body' })],
    ['save_draft', saveArgs({ contentSource: 'inline body' })],
  ])('%s refuses contentSource and filePath together', async (tool, args) => {
    const result = await run(tool, { ...args, filePath: await note() });

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/either contentSource or filePath, not both/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('save_draft refuses to save nothing', async () => {
    const result = await run('save_draft', saveArgs({}));

    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/exactly one of contentSource or filePath/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('explicit failures that never reach the API', () => {
    const tools: [string, (extra: Record<string, unknown>) => Record<string, unknown>][] = [
      ['create_page', createArgs],
      ['save_draft', saveArgs],
    ];

    it.each([
      ['a relative path', () => 'notes.md', /must be an absolute path/],
      ['a ~ path', () => '~/.openclaw/workspace/paper.md', /"~" and relative paths are not expanded/],
      ['a file that is not Markdown or text', () => path.join(dir, '.env'), /Markdown or plain-text file/],
    ])('%s', async (_label, given, message) => {
      for (const [tool, args] of tools) {
        const result = await run(tool, args({ filePath: given() }));
        expect(result.isError).toBe(true);
        expect(result.text).toMatch(message);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a file when NEXT_WIKI_MCP_FILE_ALLOW_DIRS is not set', async () => {
      const file = await note();
      delete process.env.NEXT_WIKI_MCP_FILE_ALLOW_DIRS;

      for (const [tool, args] of tools) {
        const result = await run(tool, args({ filePath: file }));
        expect(result.isError).toBe(true);
        expect(result.text).toMatch(/off until NEXT_WIKI_MCP_FILE_ALLOW_DIRS/);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a file outside the allowed directories', async () => {
      const other = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-body-other-'));
      try {
        const file = path.join(other, 'secret.md');
        await fs.writeFile(file, 'secret');

        for (const [tool, args] of tools) {
          const result = await run(tool, args({ filePath: file }));
          expect(result.isError).toBe(true);
          expect(result.text).toMatch(/outside allowed directories/);
        }
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        await fs.rm(other, { recursive: true, force: true });
      }
    });
  });
});
