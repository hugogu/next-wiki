// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageListDescription } from '@/components/pages/PageListDescription';
describe('published-page list description', () => {
  it('omits an absent fallback description', () => { expect(renderToStaticMarkup(<PageListDescription value={null} />)).toBe(''); });
});
