'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PublishButton } from '@/components/pages/PublishButton';
import { useTranslation } from '@/i18n/client';
import { RevisionDiffView } from './RevisionDiffView';

export type HistoryRevision = {
  version: number;
  status: string;
  meta: string;
  canPublish: boolean;
};

type ComparedRevision = {
  version: number;
  contentSource: string;
  contentHtml: string;
};

export function HistoryRevisionSelector({
  path,
  revisions,
  pageId,
  selectedPair,
  earlier,
  later,
}: {
  path: string;
  revisions: HistoryRevision[];
  pageId?: string;
  selectedPair?: { earlier: number; later: number };
  earlier?: ComparedRevision;
  later?: ComparedRevision;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const pairSelection = selectedPair ? [selectedPair.earlier, selectedPair.later] : [];
  const [pendingSelection, setPendingSelection] = useState<number[]>([]);
  const selected = selectedPair ? pairSelection : pendingSelection;

  const updateComparison = (versions: number[]) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('compare');
    if (versions.length === 2) {
      const [first, second] = versions;
      next.set('compare', `${Math.min(first!, second!)}..${Math.max(first!, second!)}`);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const select = (version: number) => {
    const next = selected.includes(version)
      ? selected.filter((item) => item !== version)
      : selected.length === 2
        ? [version]
        : [...selected, version];
    setPendingSelection(next);
    if (next.length !== 1 || selectedPair) updateComparison(next);
  };

  return (
    <div className="grid min-h-0 gap-lg lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="min-h-0 lg:max-h-[calc(100vh-14rem)] lg:overflow-auto">
        <p className="mb-sm text-sm text-muted" aria-live="polite">
          {selected.length === 2
            ? t('page.history.compare.ready')
            : t('page.history.compare.selectHint')}
        </p>
        <ul className="space-y-xs" aria-label={t('page.history.compare.selectionLabel')}>
          {revisions.map((revision) => {
            const isSelected = selected.includes(revision.version);
            return (
              <li
                key={revision.version}
                className={`flex items-center gap-xs rounded-lg border p-sm ${
                  isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                }`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  aria-pressed={isSelected}
                  onClick={() => select(revision.version)}
                >
                  <span className="block font-medium">
                    {t('page.history.compare.selectVersion', { version: revision.version })}
                  </span>
                  <span className="text-xs text-muted capitalize">{revision.status}</span>
                  <span className="block text-xs text-muted">{revision.meta}</span>
                </button>
                {revision.status === 'draft' && revision.canPublish && pageId ? (
                  <PublishButton pageId={pageId} path={path} version={revision.version} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>
      <section className="min-w-0">
        {earlier && later ? (
          <RevisionDiffView earlier={earlier} later={later} />
        ) : (
          <div className="rounded-lg bg-surface-elevated p-lg text-sm text-muted">
            {t('page.history.compare.selectHint')}
          </div>
        )}
      </section>
    </div>
  );
}
