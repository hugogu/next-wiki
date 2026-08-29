import { describe, expect, it, vi } from 'vitest';
import { NextWikiClient } from '../src/client.js';

describe('NextWikiClient', () => {
  it('sends the version and bearer headers and mirrors a complete snapshot', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ outcome: 'created', sourcePath: 'AGENTS.md', revisionId: 'r', pageId: 'p' }), { status: 201 }));
    const client = new NextWikiClient({ baseUrl: 'https://wiki.example', mirrorKey: 'mirror', knowledgeKey: 'search', fetchImpl });
    await client.mirror({ sourcePath: 'AGENTS.md', content: '# A', sourceDigest: 'a'.repeat(64), idempotencyKey: 'AGENTS.md:a' });
    expect(fetchImpl).toHaveBeenCalledWith('https://wiki.example/api/v1/memory/wiki/documents', expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ authorization: 'Bearer mirror', 'x-next-wiki-memory-provider-version': '1' }) }));
  });

  it('classifies server failures as retryable without returning response bodies', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'secret content' }), { status: 503 }));
    const client = new NextWikiClient({ baseUrl: 'https://wiki.example', mirrorKey: 'mirror', knowledgeKey: 'search', fetchImpl });
    await expect(client.search('private')).rejects.toMatchObject({ message: 'INTERNAL_ERROR', retryable: true });
  });
});
