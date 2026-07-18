'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiGet } from '@/lib/api/client';
import { getPublicApiPageUrl, getSpaceHref } from '@/lib/path';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LinkIcon } from '@/components/icons';
import { PublishAsLinkDialog } from './PublishAsLinkDialog';

type AdminSession = { id: string; role: 'admin' | 'editor' | 'reader' };

function isAdminSession(value: unknown): value is AdminSession {
  return Boolean(value) && typeof value === 'object' && (value as { role?: unknown }).role === 'admin';
}

export function ProvenanceIndicators({
  pageId,
  allowPublishLink = false,
  targetTitle,
}: {
  pageId: string;
  allowPublishLink?: boolean;
  targetTitle?: string;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState<PublicPageResource | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  if (!isAdmin) return null;

  const linkTarget = page?.kind === 'link' ? page.linkTarget : null;
  const wasHumanModified = page?.kind === 'native' && page.origin?.nature === 'generated' && page.humanModified;

  if (!linkTarget && !wasHumanModified && !allowPublishLink) return null;

  return (
    <div className="mb-lg flex flex-wrap items-center gap-sm" data-testid="page-provenance-indicators">
      {linkTarget && (
        <Link href={getSpaceHref('generated', linkTarget.path)}>
          <StatusBadge tone="info">{t('page.indicators.linkedFromGenerated')}</StatusBadge>
        </Link>
      )}
      {wasHumanModified && <StatusBadge tone="warning">{t('page.indicators.generatedHumanModified')}</StatusBadge>}
      {allowPublishLink && page?.status === 'published' && (
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          <LinkIcon className="mr-xs h-4 w-4" />
          {t('page.publishLink.button')}
        </Button>
      )}
      {dialogOpen && (
        <PublishAsLinkDialog
          targetPageId={pageId}
          targetTitle={targetTitle ?? page?.title ?? ''}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
