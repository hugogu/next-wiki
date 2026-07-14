'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PublishButton } from '@/components/pages/PublishButton';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
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

type SelectedRevision = {
  version: number;
  contentHtml: string;
};

export function HistoryRevisionSelector({
  path,
  revisions,
  pageId,
  selectedPair,
  selectedVersion,
  earlier,
  later,
  selectedRevision,
}: {
  path: string;
  revisions: HistoryRevision[];
  pageId?: string;
  selectedPair?: { earlier: number; later: number };
  selectedVersion?: number;
  earlier?: ComparedRevision;
  later?: ComparedRevision;
  selectedRevision?: SelectedRevision;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const pairSelection = selectedPair ? [selectedPair.earlier, selectedPair.later] : [];
  const selected = selectedPair ? pairSelection : selectedVersion ? [selectedVersion] : [];

  const updateSelection = (versions: number[]) => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('compare');
    next.delete('selected');
    if (versions.length === 2) {
      const [first, second] = versions;
      next.set('compare', `${Math.min(first!, second!)}..${Math.max(first!, second!)}`);
    } else if (versions.length === 1) {
      next.set('selected', String(versions[0]));
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const select = (version: number) => {
    const next = selected.includes(version)
      ? selected.filter((item) => item !== version)
      : selected.length === 2
        ? [version]
        : [...selected, version];
    updateSelection(next);
  };

  return (
    <div className="grid min-h-0 gap-xl lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="min-h-0 pr-md [scrollbar-gutter:stable] lg:max-h-[calc(100vh-14rem)] lg:overflow-auto">
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
                className={`flex items-center gap-xs rounded-md border p-xs ${
                  isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-xs px-xs py-1 text-left"
                  aria-pressed={isSelected}
                  onClick={() => select(revision.version)}
                >
                  <span className="shrink-0 font-medium">
                    {t('page.history.compare.selectVersion', { version: revision.version })}
                  </span>
                  <span className="rounded bg-surface-elevated px-xs py-px text-xs text-muted capitalize">
                    {revision.status}
                  </span>
                  <span className="min-w-0 truncate text-xs text-muted">{revision.meta}</span>
                </button>
                {revision.status === 'draft' && revision.canPublish && pageId ? (
                  <PublishButton pageId={pageId} path={path} version={revision.version} iconOnly />
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>
      <section className="min-w-0">
        {earlier && later ? (
          <RevisionDiffView earlier={earlier} later={later} />
        ) : selectedRevision ? (
          <article className="rounded-lg bg-surface p-lg">
            <p className="mb-md text-sm text-muted">
              {t('page.revision.heading', { version: selectedRevision.version })}
            </p>
            <ContentRenderer html={selectedRevision.contentHtml} />
          </article>
        ) : (
          <div className="rounded-lg bg-surface-elevated p-lg text-sm text-muted">
            {t('page.history.compare.selectHint')}
          </div>
        )}
      </section>
    </div>
  );
}
