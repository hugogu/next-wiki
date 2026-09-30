import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resolveReaderPage: vi.fn(), getPageById: vi.fn() }));
vi.mock('./reader-routing', () => ({ resolveReaderPage: mocks.resolveReaderPage }));
vi.mock('./public-content', () => ({ getPageById: mocks.getPageById }));
import { getPageByReference } from './public-page-reference';
const ctx = { actor: { kind: 'user' as const, userId: 'reader', role: 'reader' as const } };

describe('getPageByReference', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['original', 'translation'])('uses reader routing for %s and rechecks API permissions on its resolved id', async (kind) => {
    mocks.resolveReaderPage.mockResolvedValue({ kind, page: { pageId: 'target-id' } });
    mocks.getPageById.mockResolvedValue({ id: 'target-id', contentSource: '# Article' });
    await expect(getPageByReference(ctx, 'https://kb.hugogu.cn/generated/old-slug?x=1#section', 'https://kb.hugogu.cn', ['publishedRevision']))
      .resolves.toMatchObject({ id: 'target-id', contentSource: '# Article' });
    expect(mocks.resolveReaderPage).toHaveBeenCalledWith(ctx, ['generated', 'old-slug']);
    expect(mocks.getPageById).toHaveBeenCalledWith(ctx, 'target-id', ['publishedRevision']);
  });
  it.each(['not_found', 'forbidden', 'unavailable'])('hides %s targets', async (kind) => {
    mocks.resolveReaderPage.mockResolvedValue({ kind });
    expect(await getPageByReference(ctx, '/wiki/private', 'https://kb.hugogu.cn')).toBeNull();
    expect(mocks.getPageById).not.toHaveBeenCalled();
  });
  it('retains API scope failures even when browser routing found a page', async () => {
    mocks.resolveReaderPage.mockResolvedValue({ kind: 'original', page: { pageId: 'raw-target' } });
    mocks.getPageById.mockRejectedValue(new Error('Space scope denied'));
    await expect(getPageByReference(ctx, '/raw/notes', 'https://kb.hugogu.cn')).rejects.toThrow('Space scope denied');
  });
  it('rejects another site before any lookup', async () => {
    await expect(getPageByReference(ctx, 'https://other.example/wiki/a', 'https://kb.hugogu.cn')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.resolveReaderPage).not.toHaveBeenCalled();
  });
});
