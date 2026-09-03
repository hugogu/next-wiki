'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { useTranslation } from '@/i18n/client';

function downloadFilename(contentDisposition: string | null): string {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = contentDisposition?.match(/filename="([^"]+)"/i)?.[1];
  let filename = encoded ?? quoted ?? 'next-wiki-export.zip';
  if (encoded) {
    try {
      filename = decodeURIComponent(encoded);
    } catch {
      // Keep the encoded filename when a server sends malformed escaping.
    }
  }
  return filename.replace(/[\\/:*?"<>|]/g, '_').trim() || 'next-wiki-export.zip';
}

export function TransferArtifactDownloadButton({ url }: { url: string }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    if (pending) return;
    setError(false);
    setPending(true);
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(`Download failed with status ${response.status}`);

      const objectUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = downloadFilename(response.headers.get('content-disposition'));
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
    } catch {
      // Keep the user on the admin page when retention cleanup or storage loss
      // makes the database's historical artifact reference unavailable.
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        disabled={pending}
        aria-busy={pending}
        onClick={() => void download()}
      >
        {pending ? t('admin.transfers.actions.downloading') : t('admin.transfers.actions.download')}
      </Button>
      {error && (
        <ModalDialog
          title={t('admin.transfers.download.unavailableTitle')}
          description={t('admin.transfers.download.unavailableMessage')}
          onClose={() => setError(false)}
          maxWidth="max-w-md"
        >
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setError(false)}>
              {t('common.actions.dismiss')}
            </Button>
          </div>
        </ModalDialog>
      )}
    </>
  );
}
