import { describe, expect, it, vi } from 'vitest';
import { NextWikiClient } from '../src/client.js';

describe('NextWikiClient', () => {
  it('sends the version and bearer headers and mirrors a complete snapshot', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ outcome: 'created', sourcePath: 'AGENTS.md', revisionId: 'r', pageId: 'p' }), { status: 201 }));
    const client = new NextWikiClient({ baseUrl: 'https://wiki.example', apiKey: 'openclaw', fetchImpl });
    await client.mirror({ sourcePath: 'AGENTS.md', content: '# A', sourceDigest: 'a'.repeat(64), idempotencyKey: 'AGENTS.md:a' });
    expect(fetchImpl).toHaveBeenCalledWith('https://wiki.example/api/v1/memory/wiki/documents', expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ authorization: 'Bearer openclaw', 'x-next-wiki-memory-provider-version': '1' }) }));
  });

  it('uses the same scoped connection key for mirror, search, and page reads', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ outcome: 'unchanged', sourcePath: 'WIKI.md', revisionId: 'r', pageId: 'p' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ coverage: { wiki: true }, results: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ pageId: 'p', content: 'ok' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ outcome: 'forgotten', sourcePath: 'WIKI.md', state: 'forgotten' }), { status: 200 }));
    const client = new NextWikiClient({ baseUrl: 'https://wiki.example', apiKey: 'one-connection-key', fetchImpl });

    await client.mirror({ sourcePath: 'WIKI.md', content: '# Wiki', sourceDigest: 'b'.repeat(64), idempotencyKey: 'WIKI.md:b' });
    await client.search('personal context');
    await client.get('p');
    await client.retire('WIKI.md');

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const call of fetchImpl.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer one-connection-key' }) }));
    }
    expect(fetchImpl).toHaveBeenLastCalledWith('https://wiki.example/api/v1/memory/wiki/documents', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ sourcePath: 'WIKI.md' }) }));
  });

  it('classifies server failures as retryable without returning response bodies', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'secret content' }), { status: 503 }));
    const client = new NextWikiClient({ baseUrl: 'https://wiki.example', apiKey: 'openclaw', fetchImpl });
    await expect(client.search('private')).rejects.toMatchObject({ message: 'INTERNAL_ERROR', retryable: true });
  });
});
