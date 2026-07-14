'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { useTranslation } from '@/i18n/client';
import { parseRevisionDiffOptions } from '@/lib/path';
import { buildDiffRows } from '@/lib/revision-diff';
import { RevisionSourceDiff } from './RevisionSourceDiff';
import { RevisionPreviewDiff } from './RevisionPreviewDiff';

type Revision = { version: number; contentSource: string; contentHtml: string };
export function RevisionDiffView({ earlier, later }: { earlier: Revision; later: Revision }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { t } = useTranslation();
  const options = parseRevisionDiffOptions(new URLSearchParams(params.toString()));
  const hasChanges = buildDiffRows(
    earlier.contentSource,
    later.contentSource,
    options.ignoreWhitespace,
  ).some((row) => row.kind !== 'unchanged');
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([key, value]) =>
      value === null ? next.delete(key) : next.set(key, value),
    );
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };
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
          onChange={(view) => update({ view: view === 'source' ? null : 'preview' })}
        />
        <label className="inline-flex items-center gap-xs text-sm">
          {t('page.diff.context')}
          <Select
            value={String(options.context)}
            onChange={(event) =>
              update({ context: event.target.value === '3' ? null : event.target.value })
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
            onClick={() => update({ ignoreWhitespace: options.ignoreWhitespace ? null : '1' })}
          />
        </label>
        <label className="inline-flex items-center gap-xs text-sm">
          {t('page.diff.syncScroll')}
          <Switch
            checked={options.sync}
            onClick={() => update({ sync: options.sync ? '0' : null })}
          />
        </label>
      </div>
      {!hasChanges && (
        <p role="status" className="text-sm text-muted">
          {t('page.diff.noChanges')}
        </p>
      )}
      {options.view === 'source' ? (
        <RevisionSourceDiff
          before={earlier.contentSource}
          after={later.contentSource}
          context={options.context}
          ignoreWhitespace={options.ignoreWhitespace}
          sync={options.sync}
        />
      ) : (
        <RevisionPreviewDiff
          before={earlier.contentSource}
          after={later.contentSource}
          beforeHtml={earlier.contentHtml}
          afterHtml={later.contentHtml}
          context={options.context}
          ignoreWhitespace={options.ignoreWhitespace}
          sync={options.sync}
        />
      )}
    </section>
  );
}
