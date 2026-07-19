'use client';

import { useState, type ReactNode } from 'react';
import type { WritingMode } from '@next-wiki/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StepPanel } from '@/components/setup/StepPanel';
import { ShieldIcon, UsersIcon } from '@/components/icons';
import { useWritingModeMutation } from '@/components/setup/useSetupOnboarding';
import { useTranslation } from '@/i18n/client';
import type { TranslationKey } from '@/i18n/types';

type ModeOption = {
  id: WritingMode;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  featureKeys: readonly TranslationKey[];
  icon: ReactNode;
  recommended?: boolean;
};

const MODE_OPTIONS: readonly ModeOption[] = [
  {
    id: 'copilot',
    titleKey: 'setup.writingMode.copilot.title',
    descriptionKey: 'setup.writingMode.copilot.description',
    featureKeys: [
      'setup.writingMode.copilot.features.feature1',
      'setup.writingMode.copilot.features.feature2',
      'setup.writingMode.copilot.features.feature3',
    ] as const,
    icon: <UsersIcon className="h-6 w-6" aria-hidden="true" />,
    recommended: true,
  },
  {
    id: 'llm-wiki',
    titleKey: 'setup.writingMode.llmWiki.title',
    descriptionKey: 'setup.writingMode.llmWiki.description',
    featureKeys: [
      'setup.writingMode.llmWiki.features.feature1',
      'setup.writingMode.llmWiki.features.feature2',
      'setup.writingMode.llmWiki.features.feature3',
    ] as const,
    icon: <ShieldIcon className="h-6 w-6" aria-hidden="true" />,
  },
];

/** One-time setup choice for the deployment's content-authoring model. */
export function WritingModeStep() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<WritingMode>('copilot');
  const mutation = useWritingModeMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['setup-state'] }),
  });

  return (
    <StepPanel title={t('setup.writingMode.title')} description={t('setup.writingMode.description')}>
      <div className="space-y-md">
        {mutation.error && <Alert>{mutation.error.message}</Alert>}
        <fieldset>
          <legend className="sr-only">{t('setup.writingMode.title')}</legend>
          <div className="grid gap-md md:grid-cols-2">
            {MODE_OPTIONS.map((option) => {
              const selected = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMode(option.id)}
                  aria-pressed={selected}
                  className={
                    selected
                      ? 'flex h-full flex-col items-start gap-md rounded-lg border-2 border-primary bg-primary/10 p-lg text-left transition-colors'
                      : 'flex h-full flex-col items-start gap-md rounded-lg border border-border bg-background p-lg text-left transition-colors hover:border-border-strong hover:bg-surface'
                  }
                >
                  <div className="flex w-full items-start justify-between gap-sm">
                    <span
                      className={
                        selected
                          ? 'flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-text'
                          : 'flex h-10 w-10 items-center justify-center rounded-md bg-surface-elevated text-foreground'
                      }
                    >
                      {option.icon}
                    </span>
                    {option.recommended && (
                      <span className="rounded bg-primary px-sm py-xs text-xs font-medium text-primary-text">
                        {t('setup.writingMode.recommended')}
                      </span>
                    )}
                  </div>
                  <div className="space-y-xs">
                    <span className="block text-lg font-semibold">{t(option.titleKey)}</span>
                    <p className="text-sm text-muted">{t(option.descriptionKey)}</p>
                  </div>
                  <ul className="mt-auto w-full space-y-xs border-t border-border/60 pt-md text-sm">
                    {option.featureKeys.map((key) => (
                      <li key={key} className="flex items-start gap-xs">
                        <span
                          aria-hidden="true"
                          className={
                            selected
                              ? 'mt-xs h-1.5 w-1.5 shrink-0 rounded-full bg-primary'
                              : 'mt-xs h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong'
                          }
                        />
                        <span className="flex-1">{t(key)}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button onClick={() => mutation.mutate({ mode })} disabled={mutation.isPending}>
            {mutation.isPending ? t('setup.writingMode.saving') : t('setup.writingMode.continue')}
          </Button>
        </div>
      </div>
    </StepPanel>
  );
}
