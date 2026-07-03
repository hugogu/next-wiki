import type { AiCitation } from '@next-wiki/shared';
import { renderMarkdown } from '@/server/pipeline';
import { linkifyCitationMarkers } from './linkify-citations';

/**
 * Regression test for the reported bug: assistant answers rendered inline
 * math as raw text and left [S1]-style citation markers unclickable. This
 * exercises the same two steps ChatAnswer runs client side (linkify, then
 * the shared /api/preview markdown pipeline) end to end.
 */
describe('assistant answer rendering pipeline', () => {
  it('renders KaTeX math and turns citation markers into links', () => {
    const citations: AiCitation[] = [
      {
        pageId: '00000000-0000-4000-8000-000000000001',
        title: 'Gaussian integral',
        path: 'math/constants/pi/integral',
        locale: 'en',
        revisionId: '00000000-0000-4000-8000-000000000002',
        revisionHash: 'hash',
      },
    ];
    const answer = 'The Gaussian integral is $\\int_{-\\infty}^{\\infty} e^{-x^2}dx = \\sqrt{\\pi}$, see [S1].';

    const linked = linkifyCitationMarkers(answer, citations);
    const { html } = renderMarkdown(linked);

    expect(html).toContain('katex');
    expect(html).toContain('<a href="/math/constants/pi/integral">S1</a>');
  });
});
