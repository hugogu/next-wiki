'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { useTranslation } from '@/i18n/client';

/**
 * Confirmation for removing the published site.
 *
 * Typing the branch name is the confirmation, matching the API: taking a site
 * down is not reversible by an undo, and a single misplaced click should not be
 * able to do it. A designed dialog rather than a browser `confirm()`, per the
 * project's UI conventions.
 */
export function TakedownDialog({
  branch,
  pending,
  onConfirm,
}: {
  branch: string;
  pending: boolean;
  onConfirm: (confirm: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const close = () => {
    setOpen(false);
    setTyped('');
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={pending}>
        {t('admin.staticSite.takedown')}
      </Button>

      {open ? (
        <ModalDialog
          title={t('admin.staticSite.takedown')}
          description={t('admin.staticSite.takedownWarning')}
          onClose={close}
          maxWidth="max-w-lg"
        >
          <div className="space-y-md">
            <label className="block text-sm">
              <span className="mb-xs block text-muted">{branch}</span>
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={branch}
                autoFocus
              />
            </label>

            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={close}>
                {t('common.actions.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={typed !== branch || pending}
                onClick={() => {
                  onConfirm(typed);
                  close();
                }}
              >
                {t('admin.staticSite.takedownConfirm')}
              </Button>
            </div>
          </div>
        </ModalDialog>
      ) : null}
    </>
  );
}
