'use client';

import { useCallback, useState } from 'react';
import { publicPageCreateInputSchema, type PublicPageCreateInput, type PublicPageResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { apiPost, type ApiError } from '@/lib/api/client';
import { getPageHref, getPublicApiPagesUrl } from '@/lib/path';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalDialog } from '@/components/ui/ModalDialog';

function deriveDefaultPath(currentPath: string): string {
  return currentPath.replace(/^generated\//, '');
}

export function PublishAsLinkDialog({
  targetPageId,
  targetTitle,
  currentPath,
  onClose,
}: {
  targetPageId: string;
  targetTitle: string;
  currentPath?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState(() => deriveDefaultPath(currentPath ?? ''));
  const [title, setTitle] = useState(targetTitle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const input = publicPageCreateInputSchema.parse({
        path,
        title,
        kind: 'link',
        linkTargetPageId: targetPageId,
      });
      const created = await apiPost<PublicPageCreateInput, PublicPageResource>(getPublicApiPagesUrl(), input);
      window.location.href = getPageHref(created.path);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError.code === 'CONFLICT' ? t('page.publishLink.error.pathExists') : t('page.publishLink.error.generic'));
      setPending(false);
    }
  }, [path, targetPageId, t, title]);

  return (
    <ModalDialog
      title={t('page.publishLink.title')}
      description={t('page.publishLink.description')}
      onClose={() => !pending && onClose()}
      maxWidth="max-w-md"
    >
      <form className="flex flex-col gap-md" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('page.publishLink.pathLabel')}</span>
          <Input value={path} onChange={(event) => setPath(event.target.value)} required />
        </label>
        <label className="block space-y-xs">
          <span className="text-sm font-medium">{t('page.publishLink.titleLabel')}</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <div className="flex justify-end gap-sm">
          <Button variant="secondary" onClick={onClose} disabled={pending}>{t('common.actions.cancel')}</Button>
          <Button type="submit" disabled={pending}>{t('page.publishLink.submit')}</Button>
        </div>
      </form>
    </ModalDialog>
  );
}
