import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { ProvenanceIndicators } from './ProvenanceIndicators';

describe('page AI indicator', () => {
  it.each(['generated', 'assisted'] as const)('shows %s attribution without an admin session', (level) => {
    const html = renderToStaticMarkup(<ProvenanceIndicators aiContentLevel={level} />);
    expect(html).toContain('page-provenance-indicators');
    expect(html).toContain(level === 'generated' ? 'page.indicators.aiGenerated' : 'page.indicators.aiAssisted');
  });
  it('renders no badge for human-authored content', () => {
    expect(renderToStaticMarkup(<ProvenanceIndicators aiContentLevel={null} />)).toBe('');
  });
});
