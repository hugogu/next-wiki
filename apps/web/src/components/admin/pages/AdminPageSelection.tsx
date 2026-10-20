'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from '@/i18n/client';

type PageSelection = {
  pageIds: string[];
  selected: string[];
  toggle: (pageId: string, checked: boolean) => void;
  setAll: (checked: boolean) => void;
  clear: () => void;
};

const PageSelectionContext = createContext<PageSelection | null>(null);
const NOTHING_SELECTED: string[] = [];

export function usePageSelection(): PageSelection {
  const selection = useContext(PageSelectionContext);
  if (!selection) throw new Error('usePageSelection must be used inside PageSelectionProvider');
  return selection;
}

/**
 * Pages chosen among those the Admin list currently shows. The choice belongs
 * to one list of pages: another page of results, a new filter or a refresh
 * that changes the rows starts with nothing selected.
 */
export function PageSelectionProvider({ pageIds, children }: { pageIds: string[]; children: ReactNode }) {
  const listKey = pageIds.join(',');
  const [selection, setSelection] = useState({ listKey, ids: NOTHING_SELECTED });
  const selected = selection.listKey === listKey ? selection.ids : NOTHING_SELECTED;

  const value = useMemo<PageSelection>(() => {
    const ids = listKey ? listKey.split(',') : [];
    const update = (next: (current: string[]) => string[]) =>
      setSelection((current) => ({ listKey, ids: next(current.listKey === listKey ? current.ids : NOTHING_SELECTED) }));
    return {
      pageIds: ids,
      selected,
      toggle: (pageId, checked) =>
        update((current) => (checked ? [...current.filter((id) => id !== pageId), pageId] : current.filter((id) => id !== pageId))),
      setAll: (checked) => update(() => (checked ? ids : NOTHING_SELECTED)),
      clear: () => update(() => NOTHING_SELECTED),
    };
  }, [listKey, selected]);
  return <PageSelectionContext.Provider value={value}>{children}</PageSelectionContext.Provider>;
}

const checkboxClass = 'h-4 w-4 rounded border-border text-primary focus:ring-primary/50';

export function PageSelectCheckbox({ pageId, title }: { pageId: string; title: string }) {
  const { t } = useTranslation();
  const { selected, toggle } = usePageSelection();
  return (
    <input
      type="checkbox"
      checked={selected.includes(pageId)}
      onChange={(event) => toggle(pageId, event.target.checked)}
      aria-label={t('admin.pages.bulk.selectPage', { title })}
      className={checkboxClass}
    />
  );
}

export function SelectAllPagesCheckbox() {
  const { t } = useTranslation();
  const { pageIds, selected, setAll } = usePageSelection();
  const allSelected = pageIds.length > 0 && selected.length === pageIds.length;
  return (
    <input
      type="checkbox"
      checked={allSelected}
      ref={(element) => {
        if (element) element.indeterminate = selected.length > 0 && !allSelected;
      }}
      onChange={(event) => setAll(event.target.checked)}
      disabled={pageIds.length === 0}
      aria-label={t('admin.pages.bulk.selectAll')}
      className={checkboxClass}
    />
  );
}
