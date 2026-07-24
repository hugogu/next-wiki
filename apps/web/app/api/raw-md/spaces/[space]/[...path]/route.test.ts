// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getCurrentActor: vi.fn(),
}));

const rawMarkdown = vi.hoisted(() => ({
  getSpaceRawMarkdown: vi.fn(),
  MARKDOWN_CONTENT_TYPE_HEADER: 'text/markdown; charset=utf-8',
  UNSUPPORTED_STATUS_CODE: 415,
}));

vi.mock('@/server/services/auth', () => auth);
vi.mock('@/server/services/raw-markdown-export', () => rawMarkdown);

import * as route from './route';

const context = (space: string, path: string[]) => ({ params: Promise.resolve({ space, path }) });

describe('/api/raw-md/spaces/[space]/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentActor.mockResolvedValue({ kind: 'user', userId: 'admin-1', role: 'admin' });
  });

  it('returns raw markdown for a generated page', async () => {
    rawMarkdown.getSpaceRawMarkdown.mockResolvedValue({ kind: 'ok', content: '# Gen\n', title: 'Gen' });
    const response = await route.GET(
      new NextRequest('http://localhost/api/raw-md/spaces/generated/foo/bar'),
      context('generated', ['foo', 'bar']),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    await expect(response.text()).resolves.toBe('# Gen\n');
  });

  it('returns 403 for forbidden access', async () => {
    rawMarkdown.getSpaceRawMarkdown.mockResolvedValue({ kind: 'forbidden' });
    const response = await route.GET(
      new NextRequest('http://localhost/api/raw-md/spaces/generated/foo'),
      context('generated', ['foo']),
    );
    expect(response.status).toBe(403);
  });

  it('returns 404 for not found space pages', async () => {
    rawMarkdown.getSpaceRawMarkdown.mockResolvedValue({ kind: 'not_found' });
    const response = await route.GET(
      new NextRequest('http://localhost/api/raw-md/spaces/raw/missing'),
      context('raw', ['missing']),
    );
    expect(response.status).toBe(404);
  });

  it('returns 415 for raw non-markdown content', async () => {
    rawMarkdown.getSpaceRawMarkdown.mockResolvedValue({ kind: 'unsupported', contentType: 'image/png' });
    const response = await route.GET(
      new NextRequest('http://localhost/api/raw-md/spaces/raw/image'),
      context('raw', ['image']),
    );
    expect(response.status).toBe(415);
  });
});
