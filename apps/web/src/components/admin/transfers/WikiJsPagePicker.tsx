'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WikijsSourcePage } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { apiGet } from '@/lib/api/client';

/** Mirrors the `pageIds` bound in wikijsTransferOptionsSchema; enforced here so
 * an over-long selection is refused while it can still be edited, rather than
 * by the API once the user has already clicked "Run preview". */
export const MAX_SELECTED_PAGES = 500;

function matches(page: WikijsSourcePage, needle: string): boolean {
  if (!needle) return true;
  return (
    page.path.toLocaleLowerCase().includes(needle) ||
    page.title.toLocaleLowerCase().includes(needle)
  );
}

/**
 * Chooses which of a Wiki.js source's pages an import should cover. The
 * inventory is fetched live on open: a selection stored from an earlier
 * session can name pages the source no longer publishes, and those would
 * otherwise fail the next preview — so they are dropped here, with a notice,
 * while the user is still looking at the list.
 */
export function WikiJsPagePicker({
  sourceId,
  selected,
  onApply,
  onClose,
}: {
  sourceId: string;
  selected: number[];
  onApply: (pageIds: number[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Frozen on mount: the picker opens with one selection and the effect below
  // must not re-run (and refetch) just because the parent re-rendered with a
  // fresh array literal.
  const [initialSelection] = useState<readonly number[]>(() => [...selected]);
  const [pages, setPages] = useState<WikijsSourcePage[] | null>(null);
  // '' means "failed with no message from the server" — distinct from null
  // ("not failed"), so the translated fallback is chosen at render time and
  // the fetch effect never has to depend on `t`.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Set<number>>(() => new Set(initialSelection));
  const [prunedCount, setPrunedCount] = useState(0);

  useEffect(() => {
    let active = true;
    apiGet<{ items: WikijsSourcePage[] }>(`/api/transfer-sources/${sourceId}/pages`)
      .then((result) => {
        if (!active) return;
        setPages(result.items);
        const available = new Set(result.items.map((page) => page.id));
        const kept = initialSelection.filter((id) => available.has(id));
        setDraft(new Set(kept));
        setPrunedCount(initialSelection.length - kept.length);
      })
      .catch((cause: { message?: string }) => {
        if (active) setLoadError(cause.message ?? '');
      });
    return () => {
      active = false;
    };
  }, [sourceId, initialSelection]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (pages ?? []).filter((page) => matches(page, needle));
  }, [pages, query]);

  const atLimit = draft.size >= MAX_SELECTED_PAGES;

  function toggle(id: number) {
    setDraft((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECTED_PAGES) next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setDraft((previous) => {
      const next = new Set(previous);
      for (const page of visible) {
        if (next.size >= MAX_SELECTED_PAGES) break;
        next.add(page.id);
      }
      return next;
    });
  }

  return (
    <ModalDialog
      title={t('admin.transfers.wikijs.pickerTitle')}
      description={t('admin.transfers.wikijs.pickerDescription')}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="grid gap-sm">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('admin.transfers.wikijs.pickerSearch')}
          disabled={!pages}
        />

        {loadError !== null && (
          <p className="text-sm text-danger">{loadError || t('admin.transfers.wikijs.pickerLoadFailed')}</p>
        )}
        {!pages && loadError === null && <p className="text-sm text-muted">{t('common.status.loading')}</p>}
        {prunedCount > 0 && (
          <p className="text-sm text-warning">
            {t('admin.transfers.wikijs.pickerStalePruned', { count: prunedCount })}
          </p>
        )}

        {pages && pages.length === 0 && (
          <p className="text-sm text-muted">{t('admin.transfers.wikijs.pickerEmpty')}</p>
        )}
        {pages && pages.length > 0 && (
          <div className="max-h-80 overflow-y-auto rounded-md border border-border">
            {visible.length === 0 ? (
              <p className="p-md text-sm text-muted">{t('admin.transfers.wikijs.pickerNoMatches')}</p>
            ) : (
              <ul>
                {visible.map((page) => {
                  const checked = draft.has(page.id);
                  return (
                    <li key={page.id} className="border-b border-border last:border-b-0">
                      <label className="flex cursor-pointer items-start gap-sm px-md py-sm hover:bg-surface-elevated">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={!checked && atLimit}
                          onChange={() => toggle(page.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{page.title}</span>
                          <span className="block truncate text-xs text-muted">
                            {page.locale}/{page.path}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {pages && pages.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-sm text-sm">
            <span className="text-muted">
              {draft.size === 0
                ? t('admin.transfers.wikijs.pickerSelectAllHint')
                : t('admin.transfers.wikijs.pickerSelectedCount', { count: draft.size, total: pages.length })}
            </span>
            <div className="flex items-center gap-sm">
              <Button variant="ghost" className="px-sm py-xs text-sm" disabled={atLimit || visible.length === 0} onClick={selectAllVisible}>
                {t('admin.transfers.wikijs.pickerSelectAll')}
              </Button>
              <Button variant="ghost" className="px-sm py-xs text-sm" disabled={draft.size === 0} onClick={() => setDraft(new Set())}>
                {t('admin.transfers.wikijs.pickerClear')}
              </Button>
            </div>
          </div>
        )}
        {atLimit && (
          <p className="text-sm text-warning">
            {t('admin.transfers.wikijs.pickerLimitReached', { limit: MAX_SELECTED_PAGES })}
          </p>
        )}

        <div className="mt-sm flex flex-wrap items-center justify-end gap-sm">
          <Button variant="secondary" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button disabled={!pages} onClick={() => onApply([...draft])}>
            {t('admin.transfers.wikijs.pickerApply')}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
