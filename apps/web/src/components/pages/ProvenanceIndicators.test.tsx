import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/i18n/client', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { ProvenanceIndicators } from './ProvenanceIndicators';

describe('page AI indicator', () => {
  it.each(['generated', 'assisted'] as const)('shows %s attribution without an admin session', (level) => {
    const html = renderToStaticMarkup(<ProvenanceIndicators aiContentLevel={level} />);
    expect(html).toContain('page-provenance-indicators');
    expect(html).toContain(level === 'generated' ? 'page.indicators.aiGenerated' : 'page.indicators.aiAssisted');
  });
  it('only exposes the clear control with permission and a reviewed revision', () => {
    const props = { aiContentLevel: 'assisted' as const, pageId: 'page', revisionId: 'revision' };
    expect(renderToStaticMarkup(<ProvenanceIndicators {...props} canClear />)).toContain('aria-label="page.indicators.clearAiLabel"');
    expect(renderToStaticMarkup(<ProvenanceIndicators {...props} />)).not.toContain('<button');
    expect(renderToStaticMarkup(<ProvenanceIndicators aiContentLevel="assisted" canClear />)).not.toContain('<button');
  });
  it('renders no badge for human-authored content', () => {
    expect(renderToStaticMarkup(<ProvenanceIndicators aiContentLevel={null} />)).toBe('');
  });
});
