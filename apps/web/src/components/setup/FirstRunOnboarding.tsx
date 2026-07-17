'use client';

import type { SetupStateView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { CheckIcon } from '@/components/icons';
import { SetupForm } from '@/components/auth/SetupForm';
import { OpenRouterBootstrapStep } from '@/components/setup/OpenRouterBootstrapStep';
import { SamplePagesStep } from '@/components/setup/SamplePagesStep';
import { SetupSummary } from '@/components/setup/SetupSummary';
import { StepPanel } from '@/components/setup/StepPanel';
import { useSetupState } from '@/components/setup/useSetupOnboarding';

const STEP_ORDER = ['account', 'ai', 'sample_pages', 'summary'] as const;

const STEP_LABEL_KEYS = {
  account: 'setup.steps.account',
  ai: 'setup.steps.ai',
  sample_pages: 'setup.steps.samplePages',
  summary: 'setup.steps.summary',
} as const;

type SetupStepName = (typeof STEP_ORDER)[number];

function StepRail({ current }: { current: SetupStepName }) {
  const { t } = useTranslation();
  const currentIndex = STEP_ORDER.indexOf(current);

  return (
    <nav aria-label={t('setup.metadataTitle')} className="shrink-0 md:w-64">
      <ol className="flex items-start overflow-x-auto md:flex-col">
        {STEP_ORDER.map((name, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={name} className="flex items-center md:items-stretch" aria-current={active ? 'step' : undefined}>
              <div className="flex items-center gap-sm md:w-full md:gap-md md:py-sm">
                <div className="flex flex-col items-center">
                  <span
                    className={
                      done
                        ? 'flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-text'
                        : active
                          ? 'flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-sm font-semibold text-primary'
                          : 'flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-sm text-muted'
                    }
                  >
                    {done ? <CheckIcon className="h-4 w-4" /> : index + 1}
                  </span>
                  {index < STEP_ORDER.length - 1 && <span className="my-xs hidden h-10 w-px bg-border md:block" />}
                </div>
                <span
                  className={
                    active
                      ? 'whitespace-nowrap text-sm font-medium text-foreground'
                      : done
                        ? 'whitespace-nowrap text-sm text-foreground'
                        : 'whitespace-nowrap text-sm text-muted'
                  }
                >
                  {t(STEP_LABEL_KEYS[name])}
                </span>
              </div>
              {index < STEP_ORDER.length - 1 && <span className="mx-sm h-px w-6 shrink-0 bg-border md:hidden" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * First-run onboarding shell: a guided wizard whose steps are driven by the
 * uncached server setup state, so refreshes resume at the next incomplete
 * step without repeating side effects.
 */
export function FirstRunOnboarding({ initialState }: { initialState: SetupStateView }) {
  const { t } = useTranslation();
  const { data: state } = useSetupState(initialState);

  const step = state.currentStep as SetupStepName;

  return (
    <div className="flex flex-col gap-xl md:flex-row">
      <StepRail current={step} />
      <div className="min-w-0 flex-1">
        {step === 'account' && (
          <StepPanel title={t('setup.account.title')} description={t('setup.account.description')}>
            <SetupForm />
          </StepPanel>
        )}
        {step === 'ai' && <OpenRouterBootstrapStep state={state} />}
        {step === 'sample_pages' && <SamplePagesStep state={state} />}
        {step === 'summary' && <SetupSummary state={state} />}
      </div>
    </div>
  );
}
