import { describe, expect, it, vi } from 'vitest';

const content = vi.hoisted(() => ({ getPageById: vi.fn(), createDraft: vi.fn() }));
const artifacts = vi.hoisted(() => ({
  getGeneratedArtifactPlacement: vi.fn(),
  promoteGeneratedArtifact: vi.fn(),
}));

vi.mock('@/server/services/public-content', () => content);
vi.mock('@/server/services/ai-artifacts', () => artifacts);

import { buildUserCtx } from '@/server/permissions';
import { insertGeneratedImages, insertGeneratedImagesIntoMarkdown } from './ai-generated-image-insertion';

const pageId = '11111111-1111-1111-1111-111111111111';
const revisionId = '22222222-2222-2222-2222-222222222222';
const artifactId = '33333333-3333-3333-3333-333333333333';
const ctx = buildUserCtx('editor-1', 'editor');

describe('generated image insertion', () => {
  it('changes only insertion points, preserving LaTex and every other source byte', () => {
    const source = '# Saturn\n\nOrbital inclination: $2.49^\\circ$.\n\nMass: $5.683 \\times 10^{26}\\ \\text{kg}$.\n';
    const next = insertGeneratedImagesIntoMarkdown(source, [
      { after: 'Orbital inclination: $2.49^\\circ$.', markdown: '![inclination](/api/assets/a)' },
      { after: 'Mass: $5.683 \\times 10^{26}\\ \\text{kg}$.', markdown: '![mass](/api/assets/b)' },
    ]);

    expect(next).toBe(
      '# Saturn\n\nOrbital inclination: $2.49^\\circ$.\n\n![inclination](/api/assets/a)\n\nMass: $5.683 \\times 10^{26}\\ \\text{kg}$.\n\n![mass](/api/assets/b)\n',
    );
    expect(next).toContain('$2.49^\\circ$');
    expect(next).toContain('$5.683 \\times 10^{26}\\ \\text{kg}$');
  });

  it('rejects an ambiguous selection instead of placing an image at an arbitrary occurrence', () => {
    expect(() => insertGeneratedImagesIntoMarkdown('Repeat.\n\nRepeat.\n', [
      { after: 'Repeat.', markdown: '![image](/api/assets/a)' },
    ])).toThrow(/occurs more than once/);
  });

  it('promotes artifacts and writes one stale-safe draft without asking the model to resend Markdown', async () => {
    const source = 'Intro $2.49^\\circ$.\n\nSelected passage.\n';
    content.getPageById.mockResolvedValue({
      title: 'Saturn',
      contentSource: source,
      latestRevision: { id: revisionId },
    });
    artifacts.getGeneratedArtifactPlacement.mockResolvedValue({
      revisionId,
      source: { kind: 'selection', text: 'Selected passage.' },
    });
    artifacts.promoteGeneratedArtifact.mockResolvedValue({ id: 'asset-1', url: '/api/assets/asset-1' });
    content.createDraft.mockResolvedValue({ version: 8 });

    await expect(insertGeneratedImages(ctx, {
      pageId,
      revisionId,
      images: [{ artifactId, altText: 'A ringed planet' }],
    })).resolves.toEqual({ version: 8, assetIds: ['asset-1'] });

    expect(content.createDraft).toHaveBeenCalledWith(ctx, pageId, {
      title: 'Saturn',
      contentSource: 'Intro $2.49^\\circ$.\n\nSelected passage.\n\n![A ringed planet](/api/assets/asset-1)\n',
      baseRevisionId: revisionId,
    });
    expect(artifacts.promoteGeneratedArtifact).toHaveBeenCalledWith(ctx, artifactId, pageId);
  });

  it('appends a page-wide illustration after existing content', () => {
    expect(insertGeneratedImagesIntoMarkdown('# Saturn\n', [
      { after: null, markdown: '![Saturn](/api/assets/a)' },
    ])).toBe('# Saturn\n\n![Saturn](/api/assets/a)');
  });

  it('appends legacy artifacts whose placement input has expired instead of failing', async () => {
    content.getPageById.mockResolvedValue({
      title: 'Saturn',
      contentSource: '# Saturn\n',
      latestRevision: { id: revisionId },
    });
    artifacts.getGeneratedArtifactPlacement.mockResolvedValue(null);
    artifacts.promoteGeneratedArtifact.mockResolvedValue({ id: 'asset-legacy', url: '/api/assets/asset-legacy' });
    content.createDraft.mockResolvedValue({ version: 9 });

    await expect(insertGeneratedImages(ctx, {
      pageId,
      revisionId,
      images: [{ artifactId, altText: 'Saturn' }],
    })).resolves.toEqual({ version: 9, assetIds: ['asset-legacy'] });

    expect(content.createDraft).toHaveBeenCalledWith(ctx, pageId, {
      title: 'Saturn',
      contentSource: '# Saturn\n\n![Saturn](/api/assets/asset-legacy)',
      baseRevisionId: revisionId,
    });
  });
});
