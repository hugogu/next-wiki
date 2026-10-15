import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const session = vi.hoisted(() => ({ createApiContext: vi.fn() }));
const pages = vi.hoisted(() => ({ getRevisionByPageId: vi.fn() }));

vi.mock('@/server/api/session', () => session);
vi.mock('@/server/services/pages', () => pages);

import { GET } from './route';

const pageId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const actor = { kind: 'user', userId: 'reader-1', role: 'reader' };

function get(version: string, id = pageId) {
  return GET(new NextRequest(`http://localhost/api/pages/${id}/revisions/${version}`), {
    params: Promise.resolve({ pageId: id, version }),
  });
}

describe('GET /api/pages/[pageId]/revisions/[version]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.createApiContext.mockResolvedValue({ actor });
  });

  it('returns only what the History view renders, with the frontmatter offset, uncached', async () => {
    pages.getRevisionByPageId.mockResolvedValue({
      version: 2,
      status: 'draft',
      contentSource: '---\ntitle: T\n---\n\n# Body',
      contentHtml: '<h1 data-line="1">Body</h1>',
      authorDisplayName: 'Someone',
      createdAt: '2026-10-15T00:00:00.000Z',
    });

    const response = await get('2');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      version: 2,
      contentSource: '---\ntitle: T\n---\n\n# Body',
      contentHtml: '<h1 data-line="1">Body</h1>',
      previewLineOffset: 4,
    });
  });

  it('reads as the signed-in visitor, so the service applies their visibility', async () => {
    pages.getRevisionByPageId.mockResolvedValue(null);

    await get('7');

    expect(pages.getRevisionByPageId).toHaveBeenCalledWith({ actor }, pageId, 7);
  });

  it('answers 404 when the revision is missing or not visible to the reader', async () => {
    pages.getRevisionByPageId.mockResolvedValue(null);

    const response = await get('3');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'NOT_FOUND' });
  });

  it.each([
    ['a non-numeric version', 'abc', pageId],
    ['version zero', '0', pageId],
    ['a version beyond the integer column', '99999999999', pageId],
    ['an id that is not a UUID', '1', 'not-a-uuid'],
  ])('rejects %s before touching the service', async (_label, version, id) => {
    const response = await get(version, id);

    expect(response.status).toBe(400);
    expect(pages.getRevisionByPageId).not.toHaveBeenCalled();
  });
});
