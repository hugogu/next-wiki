'use client';

import type { SetupStateView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { StepPanel } from '@/components/setup/StepPanel';
import { PurposeResultList } from '@/components/setup/OpenRouterBootstrapStep';
import { SamplePageResultList } from '@/components/setup/SamplePagesStep';

const AI_STATUS_KEYS = {
  skipped: 'setup.summary.status.skipped',
  completed: 'setup.summary.status.completed',
  partial: 'setup.summary.status.partial',
  failed: 'setup.summary.status.failed',
  disabled: 'setup.summary.status.disabled',
} as const;

const SAMPLE_STATUS_KEYS = {
  skipped: 'setup.summary.status.skipped',
  completed: 'setup.summary.status.completed',
  partial: 'setup.summary.status.partial',
  failed: 'setup.summary.status.failed',
} as const;

/**
 * Final onboarding summary: Admin account, AI bootstrap outcome per purpose,
 * sample page results, remaining manual actions, and navigation into the wiki
 * and Admin AI settings. Contains no credentials.
 */
export function SetupSummary({ state }: { state: SetupStateView }) {
  const { t } = useTranslation();

  const aiStatus = state.aiStatus ?? 'not_started';
  const sampleStatus = state.samplePagesStatus ?? 'not_started';
  const ai = state.summary?.ai ?? null;
  const pages = state.summary?.samplePages ?? null;
  const aiIncomplete = aiStatus !== 'completed';

  return (
    <StepPanel title={t('setup.summary.title')} description={t('setup.summary.description')}>
      <div className="space-y-lg">
        <dl className="space-y-md text-sm">
          <div className="flex justify-between gap-md">
            <dt className="text-muted">{t('setup.summary.adminCreated')}</dt>
            <dd>{state.summary?.adminCreated ? '✓' : '—'}</dd>
          </div>
          <div>
            <div className="flex justify-between gap-md">
              <dt className="text-muted">{t('setup.summary.aiStatus')}</dt>
              <dd>{aiStatus in AI_STATUS_KEYS ? t(AI_STATUS_KEYS[aiStatus as keyof typeof AI_STATUS_KEYS]) : aiStatus}</dd>
            </div>
            {ai && (
              <div className="mt-sm border-l-2 border-border pl-md">
                <PurposeResultList purposes={ai} />
              </div>
            )}
          </div>
          <div>
            <div className="flex justify-between gap-md">
              <dt className="text-muted">{t('setup.summary.samplePagesStatus')}</dt>
              <dd>{sampleStatus in SAMPLE_STATUS_KEYS ? t(SAMPLE_STATUS_KEYS[sampleStatus as keyof typeof SAMPLE_STATUS_KEYS]) : sampleStatus}</dd>
            </div>
            {pages && pages.length > 0 && (
              <div className="mt-sm border-l-2 border-border pl-md">
                <SamplePageResultList pages={pages} />
              </div>
            )}
          </div>
        </dl>

        {aiIncomplete && (
          <div className="space-y-xs">
            <h3 className="text-sm font-medium">{t('setup.summary.manualActions')}</h3>
            <p className="text-sm text-muted">{t('setup.summary.configureAiManually')}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-sm">
          <Button onClick={() => { window.location.href = '/'; }}>
            {t('setup.summary.goToWiki')}
          </Button>
          {aiIncomplete && (
            <Button variant="secondary" onClick={() => { window.location.href = '/admin/ai'; }}>
              {t('setup.summary.goToAiSettings')}
            </Button>
          )}
        </div>
      </div>
    </StepPanel>
  );
}
