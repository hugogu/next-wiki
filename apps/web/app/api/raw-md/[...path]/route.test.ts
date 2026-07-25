// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rawMarkdown = vi.hoisted(() => ({
  getWikiRawMarkdown: vi.fn(),
  MARKDOWN_CONTENT_TYPE_HEADER: 'text/markdown; charset=utf-8',
  UNSUPPORTED_STATUS_CODE: 415,
}));

vi.mock('@/server/services/raw-markdown-export', () => rawMarkdown);

import * as route from './route';

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

describe('/api/raw-md/[...path]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns raw markdown with text/markdown header', async () => {
    rawMarkdown.getWikiRawMarkdown.mockResolvedValue({
      kind: 'ok',
      content: '# Hello\n',
      title: 'Hello',
    });
    const response = await route.GET(new NextRequest('http://localhost/api/raw-md/foo/bar'), context(['foo', 'bar']));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    await expect(response.text()).resolves.toBe('# Hello\n');
  });

  it('returns 404 for not found pages', async () => {
    rawMarkdown.getWikiRawMarkdown.mockResolvedValue({ kind: 'not_found' });
    const response = await route.GET(new NextRequest('http://localhost/api/raw-md/missing'), context(['missing']));
    expect(response.status).toBe(404);
  });

  it('returns 404 for unavailable translations', async () => {
    rawMarkdown.getWikiRawMarkdown.mockResolvedValue({ kind: 'unavailable' });
    const response = await route.GET(new NextRequest('http://localhost/api/raw-md/zh/foo'), context(['zh', 'foo']));
    expect(response.status).toBe(404);
  });

  it('returns 415 for unsupported content types', async () => {
    rawMarkdown.getWikiRawMarkdown.mockResolvedValue({ kind: 'unsupported', contentType: 'application/json' });
    const response = await route.GET(new NextRequest('http://localhost/api/raw-md/foo'), context(['foo']));
    expect(response.status).toBe(415);
  });
});
