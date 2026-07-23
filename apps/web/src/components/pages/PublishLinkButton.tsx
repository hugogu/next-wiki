'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { LinkIcon } from '@/components/icons';
import { PublishAsLinkDialog } from './PublishAsLinkDialog';
import { useProtectedPage } from './ProvenanceIndicators';

export function PublishLinkButton({
  pageId,
  targetTitle,
  currentPath,
}: {
  pageId: string;
  targetTitle: string;
  currentPath?: string;
}) {
  const { t } = useTranslation();
  const { page, isAdmin } = useProtectedPage(pageId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isAdmin || page?.status !== 'published') return null;

  return (
    <>
      <Tooltip label={t('page.publishLink.button')}>
        <Button
          size="icon"
          variant="secondary"
          aria-label={t('page.publishLink.button')}
          onClick={() => setDialogOpen(true)}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </Tooltip>
      {dialogOpen && (
        <PublishAsLinkDialog
          targetPageId={pageId}
          targetTitle={targetTitle}
          currentPath={currentPath}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
