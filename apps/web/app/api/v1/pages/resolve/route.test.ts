import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
const lookup = vi.hoisted(() => vi.fn());
vi.mock('@/server/api/audit-wrapper', () => ({ withApiAudit: (handler: unknown) => handler }));
vi.mock('@/server/api/session', () => ({ createApiContext: vi.fn(async () => ({ actor: { kind: 'api_key', userId: 'reader', role: 'reader', scopes: ['view'], keyId: 'key' } })) }));
vi.mock('@/server/services/public-page-reference', () => ({ getPageByReference: lookup }));
import { GET } from './route';

describe('GET /api/v1/pages/resolve', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
  it('reads Markdown by URL with revision includes', async () => {
    vi.stubEnv('APP_URL', 'https://kb.hugogu.cn');
    lookup.mockResolvedValue({ id: 'page-id', contentSource: '# Article' });
    const params = new URLSearchParams({ url: 'https://kb.hugogu.cn/generated/article', include: 'latestRevision,publishedRevision' });
    const response = await GET(new NextRequest(`http://localhost/api/v1/pages/resolve?${params}`), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contentSource: '# Article' });
    expect(lookup).toHaveBeenCalledWith(expect.anything(), 'https://kb.hugogu.cn/generated/article', 'https://kb.hugogu.cn', ['latestRevision', 'publishedRevision']);
  });
  it('returns 404 for a missing or unreadable URL and validates required input', async () => {
    lookup.mockResolvedValue(null);
    const response = await GET(new NextRequest('http://localhost/api/v1/pages/resolve?url=%2Fwiki%2Fhidden'), { params: Promise.resolve({}) });
    expect(response.status).toBe(404);
    lookup.mockClear();
    const invalid = await GET(new NextRequest('http://localhost/api/v1/pages/resolve'), { params: Promise.resolve({}) });
    expect(invalid.status).toBe(422);
    expect(lookup).not.toHaveBeenCalled();
  });
});
