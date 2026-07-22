import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AiToolProposalDetail } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ToolProposalDetail } from './ToolProposalDetail';

function detail(overrides: Partial<AiToolProposalDetail> = {}): AiToolProposalDetail {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    kind: 'tag_update',
    status: 'pending',
    title: 'Retag 2 pages',
    rationale: 'Consolidate payment routing tags',
    requestedReview: 'admin_review',
    effectiveReview: 'admin_review',
    workflowId: null,
    toolCallId: null,
    sourceToolName: 'rename_tag',
    createdByUserId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    appliedAt: null,
    createdAt: '2026-07-22T00:00:00.000Z',
    hasConflict: false,
    items: [
      {
        id: 'i1',
        resourceKind: 'tag',
        resourceId: 't1',
        resourceLabel: 'payment-routing',
        beforeState: { name: 'pay-routing' },
        afterState: { name: 'payment-routing' },
        applyStatus: 'pending',
        hasConflict: false,
        errorCode: null,
        errorMessage: null,
      },
    ],
    evidenceLinks: [],
    ...overrides,
  };
}

function render(model: AiToolProposalDetail): string {
  return renderToStaticMarkup(
    <ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}>
      <ToolProposalDetail initial={model} />
    </ApplicationI18nProvider>,
  );
}

describe('ToolProposalDetail', () => {
  it('renders title, rationale, and item before/after state', () => {
    const html = render(detail());
    expect(html).toContain('Retag 2 pages');
    expect(html).toContain('Consolidate payment routing tags');
    expect(html).toContain('pay-routing');
    expect(html).toContain('payment-routing');
  });

  it('shows approve and reject controls for a pending proposal, but not apply', () => {
    const html = render(detail({ status: 'pending' }));
    expect(html).toContain('Approve');
    expect(html).toContain('Reject');
    expect(html).not.toContain('>Apply<');
  });

  it('shows apply for an approved proposal', () => {
    const html = render(detail({ status: 'approved' }));
    expect(html).toContain('Apply');
  });

  it('surfaces a conflict badge when the current state changed', () => {
    const html = render(detail({ hasConflict: true }));
    expect(html).toContain('Current state changed since this proposal was prepared.');
  });

  it('offers no mutating controls once applied', () => {
    const html = render(detail({ status: 'applied' }));
    expect(html).not.toContain('Approve');
    expect(html).not.toContain('>Apply<');
    expect(html).not.toContain('Reject');
  });
});
