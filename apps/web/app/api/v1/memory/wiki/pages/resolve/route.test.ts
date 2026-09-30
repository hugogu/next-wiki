import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })) }));
vi.mock('@/server/services/agent-memory-documents', () => ({ readKnowledgePageByUrl: read }));
import { GET } from './route';

describe('bound memory URL read route', () => {
  afterEach(() => vi.clearAllMocks());
  it('forwards the URL and content bound and disables caching', async () => {
    read.mockResolvedValue({ pageId: 'id', content: '# Article', revisionId: 'revision' });
    const request = new NextRequest('http://localhost/api/v1/memory/wiki/pages/resolve?url=%2Fgenerated%2Farticle&maxChars=1200', { headers: { 'x-next-wiki-memory-provider-version': '1' } });
    const response = await GET(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(read).toHaveBeenCalledWith(expect.anything(), '/generated/article', 1200);
    expect(await response.json()).toMatchObject({ revisionId: 'revision' });
  });
  it('validates URL, content bounds and provider headers before reading', async () => {
    for (const query of ['maxChars=1200', 'url=%2Fwiki%2Fa&maxChars=0']) {
      const response = await GET(new NextRequest(`http://localhost/api/v1/memory/wiki/pages/resolve?${query}`, { headers: { 'x-next-wiki-memory-provider-version': '1' } }), { params: Promise.resolve({}) });
      expect(response.status).toBe(422);
    }
    const incompatible = await GET(new NextRequest('http://localhost/api/v1/memory/wiki/pages/resolve?url=%2Fwiki%2Fa'), { params: Promise.resolve({}) });
    expect(incompatible.status).not.toBe(200);
    expect(read).not.toHaveBeenCalled();
  });
});
