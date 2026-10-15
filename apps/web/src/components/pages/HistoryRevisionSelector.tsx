'use client';

import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PublishButton } from '@/components/pages/PublishButton';
import { DeleteRevisionButton } from '@/components/pages/DeleteRevisionButton';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/client';
import { apiGet } from '@/lib/api/client';
import type { HistoryRevision } from '@/lib/history-revision';
import { createHistoryViewState, historyViewReducer, sameSelection } from '@/lib/history-view-state';
import { optionsSearchPatch, replaceHistorySearch, selectionSearchPatch } from '@/lib/history-url';
import {
  defaultComparePair,
  getPageRevisionViewUrl,
  type ReaderSpace,
  type RevisionDiffOptions,
} from '@/lib/path';
import { RevisionDiffView } from './RevisionDiffView';

export type HistoryRevisionSummary = {
  version: number;
  status: string;
  meta: string;
  canPublish: boolean;
  canDelete: boolean;
};

type RevisionRowProps = {
  revision: HistoryRevisionSummary;
  pageId: string;
  path: string;
  space: ReaderSpace;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: (version: number) => void;
  onPrefetch: (version: number) => void;
};

// Memoized so that picking a version re-renders the two rows whose highlight
// changed, not every row of a long history.
const RevisionRow = memo(function RevisionRow({
  revision,
  pageId,
  path,
  space,
  isSelected,
  isCurrent,
  onSelect,
  onPrefetch,
}: RevisionRowProps) {
  const { t } = useTranslation();
  return (
    <li
      className={`flex items-center gap-xs rounded-md border p-xs ${
        isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
      } ${isCurrent ? 'border-l-4' : ''}`}
      style={isCurrent ? { borderLeftColor: 'var(--color-diff-added)' } : undefined}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-xs py-1 text-left"
        aria-pressed={isSelected}
        onClick={() => onSelect(revision.version)}
        onPointerEnter={() => onPrefetch(revision.version)}
        onFocus={() => onPrefetch(revision.version)}
      >
        <span className="flex min-w-0 items-center gap-xs">
          <span className="shrink-0 font-medium">
            {t('page.history.compare.selectVersion', { version: revision.version })}
          </span>
          <span className="rounded bg-surface-elevated px-xs py-px text-xs text-muted capitalize">
            {revision.status}
          </span>
          {isCurrent ? (
            <span
              className="shrink-0 rounded px-xs py-px text-xs font-medium"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-diff-added) 18%, transparent)',
                color: 'var(--color-diff-added)',
              }}
            >
              {t('page.history.current')}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 truncate text-xs text-muted">{revision.meta}</span>
      </button>
      {revision.status === 'draft' && revision.canPublish ? (
        <PublishButton pageId={pageId} path={path} space={space} version={revision.version} iconOnly />
      ) : null}
      {revision.status === 'published' && revision.canPublish && !isCurrent ? (
        <PublishButton
          pageId={pageId}
          path={path}
          space={space}
          version={revision.version}
          iconOnly
          variant="restore"
        />
      ) : null}
      {revision.canDelete ? (
        <DeleteRevisionButton pageId={pageId} path={path} space={space} version={revision.version} />
      ) : null}
    </li>
  );
});

/**
 * The version list and the pane beside it. Picking a version is local state:
 * the highlight moves at once and the revision is fetched on demand (and kept),
 * instead of navigating the whole History page through the server for each
 * click. The address bar is kept in step with `replaceState`, so the view stays
 * shareable and a reload shows the same thing.
 */
export function HistoryRevisionSelector({
  path,
  revisions,
  pageId,
  space = 'wiki',
  currentVersion,
  initialSelection,
  initialRevisions,
  initialOptions,
}: {
  path: string;
  revisions: HistoryRevisionSummary[];
  pageId: string;
  space?: ReaderSpace;
  currentVersion?: number;
  /** The one or two versions the URL named, or the default comparison. */
  initialSelection: number[];
  /** Content for `initialSelection`, so the first paint needs no request. */
  initialRevisions: HistoryRevision[];
  initialOptions: RevisionDiffOptions;
}) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(historyViewReducer, undefined, () => {
    // Clicking off the last picked version means "what changed most recently",
    // like opening History without a comparison does.
    const latest = defaultComparePair(revisions);
    return createHistoryViewState({
      selection: initialSelection,
      fallback: latest ? [latest.earlier, latest.later] : [],
      revisions: initialRevisions,
    });
  });
  const [options, setOptions] = useState(initialOptions);
  // Versions already loaded or on their way, so a hover and a click on the same
  // version share one request.
  const requested = useRef<Set<number> | null>(null);
  if (requested.current === null) {
    requested.current = new Set(initialRevisions.map((revision) => revision.version));
  }

  const request = useCallback(
    (version: number) => {
      const known = requested.current!;
      if (known.has(version)) return;
      known.add(version);
      dispatch({ type: 'loading', version });
      apiGet<HistoryRevision>(getPageRevisionViewUrl(pageId, version)).then(
        (revision) => dispatch({ type: 'loaded', revision }),
        () => {
          known.delete(version);
          dispatch({ type: 'failed', version });
        },
      );
    },
    [pageId],
  );
  const select = useCallback((version: number) => dispatch({ type: 'toggle', version }), []);
  const changeOptions = useCallback(
    (patch: Partial<RevisionDiffOptions>) => setOptions((current) => ({ ...current, ...patch })),
    [],
  );

  useEffect(() => {
    state.selection.forEach(request);
  }, [state.selection, request]);

  // Write the address bar only when it falls behind the state, so opening
  // History leaves the URL alone.
  const urlSelection = useRef(initialSelection);
  useEffect(() => {
    if (sameSelection(urlSelection.current, state.selection)) return;
    urlSelection.current = state.selection;
    replaceHistorySearch(selectionSearchPatch(state.selection));
  }, [state.selection]);
  const urlOptions = useRef(initialOptions);
  useEffect(() => {
    if (urlOptions.current === options) return;
    urlOptions.current = options;
    replaceHistorySearch(optionsSearchPatch(options));
  }, [options]);

  const shown = state.displayed.map((version) => state.revisions[version]);
  const earlier = shown.length === 2 ? shown[0] : undefined;
  const later = shown.length === 2 ? shown[1] : undefined;
  const single = shown.length === 1 ? shown[0] : undefined;
  const pending = !sameSelection(state.displayed, state.selection);
  const failedVersions = state.selection.filter((version) => state.failed[version]);

  return (
    <div className="grid min-h-0 gap-xl lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="min-h-0 pr-md [scrollbar-gutter:stable] lg:max-h-[calc(100vh-14rem)] lg:overflow-auto">
        <p className="mb-sm text-sm text-muted" aria-live="polite">
          {state.selection.length === 2
            ? t('page.history.compare.ready')
            : t('page.history.compare.selectHint')}
        </p>
        <ul className="space-y-xs" aria-label={t('page.history.compare.selectionLabel')}>
          {revisions.map((revision) => (
            <RevisionRow
              key={revision.version}
              revision={revision}
              pageId={pageId}
              path={path}
              space={space}
              isSelected={state.selection.includes(revision.version)}
              isCurrent={revision.version === currentVersion}
              onSelect={select}
              onPrefetch={request}
            />
          ))}
        </ul>
      </aside>
      {/* The loading message is a live region inside this section, so the section is not
          marked `aria-busy`: that would hold the announcement back until loading is over. */}
      <section className="min-w-0">
        <p role="status" className="sr-only">
          {pending && failedVersions.length === 0 ? t('common.status.loading') : ''}
        </p>
        {failedVersions.length > 0 ? (
          <div className="mb-md flex flex-wrap items-center gap-sm">
            <Alert>{t('page.history.revision.loadError', { version: failedVersions.join(', ') })}</Alert>
            <Button type="button" variant="secondary" onClick={() => failedVersions.forEach(request)}>
              {t('page.history.revision.retry')}
            </Button>
          </div>
        ) : null}
        {/* The old content stays up, dimmed after a beat, while a picked revision loads. */}
        <div className={`transition-opacity ${pending ? 'opacity-60 delay-150' : ''}`}>
          {earlier && later ? (
            <RevisionDiffView
              earlier={earlier}
              later={later}
              options={options}
              onOptionsChange={changeOptions}
            />
          ) : single ? (
            <article className="rounded-lg bg-surface p-lg">
              <p className="mb-md text-sm text-muted">
                {t('page.revision.heading', { version: single.version })}
              </p>
              <ContentRenderer html={single.contentHtml} />
            </article>
          ) : (
            <div className="rounded-lg bg-surface-elevated p-lg text-sm text-muted">
              {t('page.history.compare.selectHint')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
