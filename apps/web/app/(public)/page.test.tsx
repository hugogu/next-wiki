// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageListDescription } from '@/components/pages/PageListDescription';
describe('homepage page-list description', () => {
  it('renders authored summary as escaped descriptive text', () => {
    expect(renderToStaticMarkup(<PageListDescription value="<strong>Summary</strong>" />)).toContain('&lt;strong&gt;Summary');
  });
});
