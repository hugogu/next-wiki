'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ImportIcon } from '@/components/icons';
import { apiPost, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { ADMIN_PAGES_CHANGED_EVENT } from './AdminPageStats';

type Visibility = 'public' | 'restricted';

/**
 * Admin-list action to move a page to the other content space (LLM Wiki mode).
 * The target's content-format requirements are handled server-side (OKF
 * frontmatter is injected automatically when moving into the generated space).
 */
export function MovePageButton({
  pageId,
  title,
  targetSpace,
  targetSpaceLabel,
}: {
  pageId: string;
  title: string;
  targetSpace: 'default' | 'generated';
  targetSpaceLabel: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>(targetSpace === 'generated' ? 'restricted' : 'public');

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await apiPost(`/api/admin/pages/${encodeURIComponent(pageId)}/move`, { targetSpace, visibility });
      setOpen(false);
      window.dispatchEvent(new Event(ADMIN_PAGES_CHANGED_EVENT));
      router.refresh();
    } catch (err) {
      setError((err as ApiError).message || t('admin.pages.move.error'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        aria-label={t('admin.pages.actions.move')}
        title={t('admin.pages.actions.move')}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <ImportIcon />
      </button>
      {open && (
        <ModalDialog
          title={t('admin.pages.move.title', { space: targetSpaceLabel })}
          description={t('admin.pages.move.description', { title, space: targetSpaceLabel })}
          onClose={() => { if (!pending) setOpen(false); }}
          maxWidth="max-w-lg"
        >
          <div className="space-y-md">
            <label className="block space-y-xs text-sm font-medium">
              <span>{t('admin.pages.move.visibilityLabel')}</span>
              <Select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
                <option value="public">{t('admin.pages.move.visibility.public')}</option>
                <option value="restricted">{t('admin.pages.move.visibility.restricted')}</option>
              </Select>
            </label>
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-sm">
              <Button variant="ghost" onClick={() => { if (!pending) setOpen(false); }}>{t('common.actions.cancel')}</Button>
              <Button onClick={submit} disabled={pending}>
                {pending ? t('common.status.saving') : t('admin.pages.move.confirm')}
              </Button>
            </div>
          </div>
        </ModalDialog>
      )}
    </>
  );
}
