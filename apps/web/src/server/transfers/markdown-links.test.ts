import { describe, expect, it } from 'vitest';
import {
  extractLocalAssetIds,
  portableAssetReference,
  rewriteMarkdownImages,
} from './markdown-links';

describe('Markdown transfer links', () => {
  it('discovers and rewrites image URLs without changing links or text', () => {
    const id = '00000000-0000-0000-0000-000000000001';
    const markdown = `![local](/api/assets/${id}) [link](/api/assets/${id}) ![remote](https://example.com/a.png)`;
    expect(extractLocalAssetIds(markdown)).toEqual([id]);
    expect(
      rewriteMarkdownImages(markdown, (url) => (url.startsWith('/api/assets/') ? '../asset.png' : null)),
    ).toContain('![local](../asset.png)');
    expect(portableAssetReference('pages/en/a/b.md', 'assets/hash.png')).toBe(
      '../../../assets/hash.png',
    );
  });
});
