'use client';

import type { SetupStateView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { SetupForm } from '@/components/auth/SetupForm';
import { OpenRouterBootstrapStep } from '@/components/setup/OpenRouterBootstrapStep';
import { SamplePagesStep } from '@/components/setup/SamplePagesStep';
import { SetupSummary } from '@/components/setup/SetupSummary';
import { useSetupState } from '@/components/setup/useSetupOnboarding';

const STEP_ORDER = ['account', 'ai', 'sample_pages', 'summary'] as const;

const STEP_LABEL_KEYS = {
  account: 'setup.steps.account',
  ai: 'setup.steps.ai',
  sample_pages: 'setup.steps.samplePages',
  summary: 'setup.steps.summary',
} as const;

/**
 * First-run onboarding shell: renders the current server-driven setup step
 * (account → AI → sample pages → summary) and keeps client state in sync with
 * the uncached setup-state resource so refreshes resume safely.
 */
export function FirstRunOnboarding({ initialState }: { initialState: SetupStateView }) {
  const { t } = useTranslation();
  const { data: state } = useSetupState(initialState);

  const step = state.currentStep;
  const stepIndex = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);

  return (
    <div className="space-y-lg">
      <ol className="flex flex-wrap gap-sm text-sm" aria-label={t('setup.metadataTitle')}>
        {STEP_ORDER.map((name, index) => (
          <li
            key={name}
            aria-current={index === stepIndex ? 'step' : undefined}
            className={
              index === stepIndex
                ? 'px-sm py-xs rounded-md bg-primary/10 text-primary font-medium'
                : 'px-sm py-xs rounded-md text-muted'
            }
          >
            {t(STEP_LABEL_KEYS[name])}
          </li>
        ))}
      </ol>

      {step === 'account' && <SetupForm />}
      {step === 'ai' && <OpenRouterBootstrapStep state={state} />}
      {step === 'sample_pages' && <SamplePagesStep state={state} />}
      {step === 'summary' && <SetupSummary state={state} />}
    </div>
  );
}
