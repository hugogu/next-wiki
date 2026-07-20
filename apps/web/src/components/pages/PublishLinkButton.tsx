'use client';

import { useState } from 'react';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
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
      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        <LinkIcon className="mr-xs h-4 w-4" />
        {t('page.publishLink.button')}
      </Button>
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
