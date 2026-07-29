import { describe, expect, it } from 'vitest';
import { buildDiffRows } from '@/lib/revision-diff';
import { previewChangedLineKinds, previewLineNumbers } from './RevisionPreviewDiff';

describe('RevisionPreviewDiff line anchors', () => {
  it('maps source diff lines past frontmatter to body-relative preview anchors', () => {
    const before = '---\ntitle: Example\n---\n\n# Heading\n\nExisting paragraph';
    const after = '---\ntitle: Example\n---\n\n# Heading\n\n![image](/asset)\n\nExisting paragraph';
    const rows = buildDiffRows(before, after);
    const offsets = { left: 4, right: 4 };

    expect(previewChangedLineKinds(rows, offsets).right).toEqual(new Map([[3, 'added']]));
    expect(previewLineNumbers(rows, offsets).right).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});
