'use client';

import { useMemo } from 'react';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { useTranslation } from '@/i18n/client';
import type { HistoryRevision } from '@/lib/history-revision';
import type { RevisionDiffOptions } from '@/lib/path';
import { buildDiffRows, withContext } from '@/lib/revision-diff';
import { RevisionSourceDiff } from './RevisionSourceDiff';
import { RevisionPreviewDiff } from './RevisionPreviewDiff';

export function RevisionDiffView({
  earlier,
  later,
  options,
  onOptionsChange,
}: {
  earlier: HistoryRevision;
  later: HistoryRevision;
  options: RevisionDiffOptions;
  onOptionsChange: (patch: Partial<RevisionDiffOptions>) => void;
}) {
  const { t } = useTranslation();
  // One diff per pair, shared by the "no changes" notice and whichever pane is
  // showing: the panes used to each recompute it on every render.
  const allRows = useMemo(
    () => buildDiffRows(earlier.contentSource, later.contentSource, options.ignoreWhitespace),
    [earlier.contentSource, later.contentSource, options.ignoreWhitespace],
  );
  const rows = useMemo(() => withContext(allRows, options.context), [allRows, options.context]);
  const hasChanges = useMemo(() => allRows.some((row) => row.kind !== 'unchanged'), [allRows]);
  return (
    <section className="space-y-md">
      <div className="flex flex-wrap items-center gap-sm">
        <strong>
          {t('page.diff.comparing', { earlier: earlier.version, later: later.version })}
        </strong>
        <ToggleButton
          ariaLabel={`${t('page.diff.source')} / ${t('page.diff.preview')}`}
          options={[
            { value: 'source', label: t('page.diff.source') },
            { value: 'preview', label: t('page.diff.preview') },
          ]}
          value={options.view}
          onChange={(view) => onOptionsChange({ view })}
        />
        <label className="inline-flex items-center gap-xs text-sm">
          {t('page.diff.context')}
          <Select
            value={String(options.context)}
            onChange={(event) =>
              onOptionsChange({
                context: event.target.value === 'full' ? 'full' : Number(event.target.value),
              })
            }
          >
            <option value="0">0</option>
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="full">{t('page.diff.fullContext')}</option>
          </Select>
        </label>
        <label className="inline-flex items-center gap-xs text-sm">
          {t('page.diff.ignoreWhitespace')}
          <Switch
            checked={options.ignoreWhitespace}
            onClick={() => onOptionsChange({ ignoreWhitespace: !options.ignoreWhitespace })}
          />
        </label>
        <label className="inline-flex items-center gap-xs text-sm">
          {t('page.diff.syncScroll')}
          <Switch
            checked={options.sync}
            onClick={() => onOptionsChange({ sync: !options.sync })}
          />
        </label>
      </div>
      {!hasChanges && (
        <p role="status" className="text-sm text-muted">
          {t('page.diff.noChanges')}
        </p>
      )}
      {options.view === 'source' ? (
        <RevisionSourceDiff rows={rows} sync={options.sync} />
      ) : (
        <RevisionPreviewDiff
          rows={rows}
          beforeHtml={earlier.contentHtml}
          afterHtml={later.contentHtml}
          beforeLineOffset={earlier.previewLineOffset}
          afterLineOffset={later.previewLineOffset}
          sync={options.sync}
        />
      )}
    </section>
  );
}
