'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { SetupSamplePageResult, SetupStateView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { StepPanel } from '@/components/setup/StepPanel';
import { useSamplePagesMutation } from '@/components/setup/useSetupOnboarding';
import { getPageHref } from '@/lib/path';

const PAGE_STATUS_KEYS = {
  created: 'setup.samplePages.pageStatus.created',
  updated: 'setup.samplePages.pageStatus.updated',
  skipped: 'setup.samplePages.pageStatus.skipped',
  collision: 'setup.samplePages.pageStatus.collision',
  failed: 'setup.samplePages.pageStatus.failed',
} as const;

export function SamplePageResultList({ pages }: { pages: SetupSamplePageResult[] | null }) {
  const { t } = useTranslation();
  if (!pages || pages.length === 0) return null;
  return (
    <ul className="space-y-xs text-sm">
      {pages.map((page) => (
        <li key={page.path} className="flex items-start justify-between gap-md">
          {page.pageId && page.status !== 'failed' && page.status !== 'collision' ? (
            <a className="text-primary underline" href={getPageHref(page.path)}>
              {page.path}
            </a>
          ) : (
            <span>{page.path}</span>
          )}
          <span className={page.status === 'failed' ? 'text-danger' : page.status === 'collision' ? 'text-warning' : 'text-muted'}>
            {t(PAGE_STATUS_KEYS[page.status])}
            {page.reason ? ` — ${page.reason}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Optional sample/help page step: generate the welcome, Markdown syntax, and
 * main features pages, or decline. Generation is idempotent; collisions with
 * user-authored pages are reported, never overwritten.
 */
export function SamplePagesStep({ state }: { state: SetupStateView }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useSamplePagesMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['setup-state'] }),
  });

  const status = state.samplePagesStatus ?? 'not_started';
  const pages = state.summary?.samplePages ?? null;
  const decided = status === 'completed' || status === 'partial' || status === 'skipped';

  return (
    <StepPanel title={t('setup.samplePages.title')} description={t('setup.samplePages.description')}>
      <div className="space-y-md">
        {mutation.error && <Alert>{mutation.error.message}</Alert>}
        {(decided || pages) && <SamplePageResultList pages={pages} />}
        {!decided && (
          <div className="flex gap-sm">
            <Button onClick={() => mutation.mutate({ mode: 'generate' })} disabled={mutation.isPending}>
              {mutation.isPending ? t('setup.samplePages.generating') : t('setup.samplePages.generate')}
            </Button>
            <Button variant="secondary" onClick={() => mutation.mutate({ mode: 'skip' })} disabled={mutation.isPending}>
              {t('setup.samplePages.skip')}
            </Button>
          </div>
        )}
      </div>
    </StepPanel>
  );
}
