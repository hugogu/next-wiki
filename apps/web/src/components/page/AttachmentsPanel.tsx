'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicAttachmentResource } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { FileTextIcon, PlusIcon, XIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { attachFile, listAttachments, removeAttachment } from '@/lib/api/attachments';
import type { ApiError } from '@/lib/api/client';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Read-only by default (attachment list + download links, per FR-002); pass
 * `canManage` to also show attach/remove controls (FR-001/FR-004). Attach
 * and remove are immediate, self-persisting actions — not part of a
 * batched "save properties" flow, since there is nothing to stage.
 */
export function AttachmentsPanel({ pageId, canManage = false }: { pageId: string; canManage?: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<PublicAttachmentResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PublicAttachmentResource | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listAttachments(pageId)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  async function handleFileSelected(file: File) {
    setUploading(true);
    setError(null);
    try {
      const created = await attachFile(pageId, file);
      setItems((current) => [created, ...(current ?? [])]);
    } catch (cause) {
      setError((cause as ApiError).message || t('page.attachments.uploadError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function confirmRemove() {
    if (!pendingRemoval) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeAttachment(pendingRemoval.id);
      setItems((current) => (current ?? []).filter((item) => item.id !== pendingRemoval.id));
      setPendingRemoval(null);
    } catch (cause) {
      setRemoveError((cause as ApiError).message || t('page.attachments.removeError'));
    } finally {
      setRemoving(false);
    }
  }

  if (items === null) return null;
  if (items.length === 0 && !canManage) return null;

  return (
    <section aria-label={t('page.attachments.heading')} className="space-y-xs">
      <h2 className="text-sm font-medium text-muted">{t('page.attachments.heading')}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('page.attachments.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-sm rounded-md border border-border px-sm py-xs text-sm"
            >
              <FileTextIcon className="h-4 w-4 shrink-0 text-muted" />
              <a
                href={item.url}
                className="min-w-0 flex-1 truncate text-primary hover:underline"
                rel="noopener"
              >
                {item.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted">{formatBytes(item.sizeBytes)}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setPendingRemoval(item)}
                  aria-label={t('page.attachments.remove', { name: item.fileName })}
                  className="shrink-0 inline-flex items-center rounded-full text-muted hover:text-danger"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {uploading ? t('page.attachments.attaching') : t('page.attachments.attach')}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}

      {pendingRemoval && (
        <ConfirmDialog
          title={t('page.attachments.removeConfirmTitle')}
          message={t('page.attachments.removeConfirmMessage', { name: pendingRemoval.fileName })}
          confirmLabel={t('page.attachments.removeConfirm')}
          confirmVariant="danger"
          pending={removing}
          error={removeError ?? undefined}
          onConfirm={() => void confirmRemove()}
          onCancel={() => {
            if (!removing) {
              setPendingRemoval(null);
              setRemoveError(null);
            }
          }}
        />
      )}
    </section>
  );
}
