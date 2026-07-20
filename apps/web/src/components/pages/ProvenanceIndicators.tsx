'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiGet } from '@/lib/api/client';
import { getPublicApiPageUrl, getSpaceHref } from '@/lib/path';
import { StatusBadge } from '@/components/ui/StatusBadge';

type AdminSession = { id: string; role: 'admin' | 'editor' | 'reader' };

function isAdminSession(value: unknown): value is AdminSession {
  return Boolean(value) && typeof value === 'object' && (value as { role?: unknown }).role === 'admin';
}

export function useProtectedPage(pageId: string) {
  const [page, setPage] = useState<PublicPageResource | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProtectedDetails() {
      try {
        const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!sessionResponse.ok || cancelled) return;
        const session: unknown = await sessionResponse.json();
        if (!isAdminSession(session) || cancelled) return;
        setIsAdmin(true);

        const resource = await apiGet<PublicPageResource>(getPublicApiPageUrl(pageId));
        if (!cancelled) setPage(resource);
      } catch {
        // Reader provenance is optional UI; the API remains the authority.
      }
    }

    void loadProtectedDetails();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return { page, isAdmin };
}

export function ProvenanceIndicators({
  pageId,
  className,
}: {
  pageId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { page, isAdmin } = useProtectedPage(pageId);

  if (!isAdmin) return null;

  const linkTarget = page?.kind === 'link' ? page.linkTarget : null;
  const wasHumanModified = page?.kind === 'native' && page.origin?.nature === 'generated' && page.humanModified;

  if (!linkTarget && !wasHumanModified) return null;

  return (
    <div className={className} data-testid="page-provenance-indicators">
      {linkTarget && (
        <Link href={getSpaceHref('generated', linkTarget.path)}>
          <StatusBadge tone="info">{t('page.indicators.linkedFromGenerated')}</StatusBadge>
        </Link>
      )}
      {wasHumanModified && <StatusBadge tone="warning">{t('page.indicators.generatedHumanModified')}</StatusBadge>}
    </div>
  );
}

export { PublishAsLinkDialog } from './PublishAsLinkDialog';
