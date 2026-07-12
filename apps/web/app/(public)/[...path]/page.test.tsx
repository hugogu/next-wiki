// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PageMetadata } from '@/components/pages/PageMetadata';

describe('reader metadata presentation', () => {
  it('renders present metadata and omits the entire section when absent', () => {
    const html = renderToStaticMarkup(<PageMetadata date="2026-07-10" summary="Summary" tags={[{ id: 'tag', name: 'DevOps', normalizedName: 'devops' }]} labels={{ date: 'Date', summary: 'Summary', tags: 'Tags' }} />);
    expect(html).toContain('2026-07-10'); expect(html).toContain('DevOps');
    expect(renderToStaticMarkup(<PageMetadata date={null} summary={null} tags={[]} labels={{ date: 'Date', summary: 'Summary', tags: 'Tags' }} />)).toBe('');
  });
});
