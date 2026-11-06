'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { XIcon } from '@/components/icons';
import { useTranslation } from '@/i18n/client';
import { usePageSelection } from './AdminPageSelection';
import { BulkVisibilityDialog } from './BulkVisibilityDialog';

/** Admin page list toolbar: what is selected, and the one entry to bulk visibility. */
export function BulkVisibilityAction({
  space,
  folder,
}: {
  space: 'default' | 'generated' | 'raw';
  /** The list's folder filter; a folder change covers it, or the whole space without one. */
  folder?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { selected, clear } = usePageSelection();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const spaceLabel = t(
    space === 'generated' ? 'admin.pages.spaces.generated' : space === 'raw' ? 'admin.pages.spaces.raw' : 'admin.pages.spaces.wiki',
  );

  return (
    <div className="space-y-xs">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="flex items-center gap-sm text-sm text-muted">
          {selected.length > 0 && (
            <>
              <span>{t('admin.pages.bulk.selected', { count: selected.length })}</span>
              <button type="button" onClick={clear} className="rounded-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/50">
                {t('admin.pages.bulk.clearSelection')}
              </button>
            </>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
        >
          {t('admin.pages.bulk.open')}
        </Button>
      </div>
      {notice && (
        <div role="status" className="flex items-center justify-between gap-sm rounded-md border border-border bg-surface-elevated px-sm py-xs text-sm">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('common.actions.dismiss')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}
      {open && (
        <BulkVisibilityDialog
          selectedPageIds={selected}
          space={space}
          spaceLabel={spaceLabel}
          folder={folder}
          onClose={() => setOpen(false)}
          onDone={(changed, visibility) => {
            setOpen(false);
            clear();
            setNotice(t('admin.pages.bulk.done', { count: changed, visibility: t(`admin.pages.visibility.${visibility}`) }));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
