'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoveIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';
import { ADMIN_PAGES_CHANGED_EVENT } from './AdminPageStats';
import { CrossSpaceMigrationDialog } from '@/components/pages/CrossSpaceMigrationDialog';

/**
 * Admin-list action to move a page to the other content space (LLM Wiki mode).
 * The target's content-format requirements are handled server-side (OKF
 * frontmatter is injected automatically when moving into the generated space).
 */
export function MovePageButton({
  pageId,
  title,
  sourceSpaceKind,
}: {
  pageId: string;
  title: string;
  sourceSpaceKind: 'wiki' | 'generated';
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('admin.pages.actions.move')}
        title={t('admin.pages.actions.move')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <MoveIcon />
      </button>
      {open && <CrossSpaceMigrationDialog selection={{ kind: 'page', pageId }} sourceSpaceKind={sourceSpaceKind} title={title} onClose={() => setOpen(false)} onComplete={() => { window.dispatchEvent(new Event(ADMIN_PAGES_CHANGED_EVENT)); router.refresh(); }} />}
    </>
  );
}
