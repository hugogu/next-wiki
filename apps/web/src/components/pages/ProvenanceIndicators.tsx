'use client';

import type { PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { StatusBadge } from '@/components/ui/StatusBadge';

export function ProvenanceIndicators({
  aiContentLevel,
  className,
}: {
  aiContentLevel?: PublicPageResource['aiContentLevel'];
  className?: string;
}) {
  const { t } = useTranslation();
  if (!aiContentLevel) return null;
  return (
    <span className={className} data-testid="page-provenance-indicators">
      <StatusBadge tone={aiContentLevel === 'generated' ? 'info' : 'warning'}>
        {t(aiContentLevel === 'generated' ? 'page.indicators.aiGenerated' : 'page.indicators.aiAssisted')}
      </StatusBadge>
    </span>
  );
}
