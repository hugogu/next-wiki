'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { getRevisionDiffHref } from '@/lib/path';
import { useTranslation } from '@/i18n/client';

export type HistoryRevision = { version: number };

export function HistoryRevisionSelector({ path, revisions }: { path: string; revisions: HistoryRevision[] }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (version: number) => setSelected((current) => current.includes(version) ? current.filter((item) => item !== version) : [...current, version].slice(-2));
  const canCompare = selected.length === 2 && selected[0] !== selected[1];
  return <div className="mb-md flex flex-wrap items-center gap-sm" aria-label={t('page.history.compare.selectionLabel')}>
    {revisions.map((revision) => <label key={revision.version} className="inline-flex items-center gap-xs text-sm text-muted"><input type="checkbox" checked={selected.includes(revision.version)} onChange={() => toggle(revision.version)} />{t('page.history.compare.selectVersion', { version: revision.version })}</label>)}
    <Button disabled={!canCompare} onClick={() => router.push(getRevisionDiffHref(path, selected[0]!, selected[1]!))}>{t('page.history.compare.submit')}</Button>
    <span className="text-sm text-muted" aria-live="polite">{canCompare ? t('page.history.compare.ready') : t('page.history.compare.selectHint')}</span>
  </div>;
}
