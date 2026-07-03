import type { AiCitation } from '@next-wiki/shared';
import { linkifyCitationMarkers } from './linkify-citations';

function citation(overrides: Partial<AiCitation>): AiCitation {
  return {
    pageId: '00000000-0000-4000-8000-000000000001',
    title: 'Guide',
    path: 'guide',
    locale: 'en',
    revisionId: '00000000-0000-4000-8000-000000000002',
    revisionHash: 'hash',
    ...overrides,
  };
}

describe('linkifyCitationMarkers', () => {
  it('turns citation markers into Markdown links matched by first-appearance order', () => {
    const citations = [citation({ path: 'math/pi/integral' }), citation({ path: 'math/e/index' })];
    const text = 'See [S1] and later [S7] and again [S1].';
    expect(linkifyCitationMarkers(text, citations)).toBe(
      'See [S1](/math/pi/integral) and later [S7](/math/e/index) and again [S1](/math/pi/integral).',
    );
  });

  it('leaves markers without a matching citation untouched', () => {
    expect(linkifyCitationMarkers('See [S1]', [])).toBe('See [S1]');
    expect(linkifyCitationMarkers('See [S1] [S2]', [citation({ path: 'a' })])).toBe('See [S1](/a) [S2]');
  });

  it('returns the original text when there are no citations', () => {
    expect(linkifyCitationMarkers('No markers here', undefined)).toBe('No markers here');
  });
});
