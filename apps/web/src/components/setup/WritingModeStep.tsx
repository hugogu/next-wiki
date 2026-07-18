'use client';

import { useState } from 'react';
import type { WritingMode } from '@next-wiki/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StepPanel } from '@/components/setup/StepPanel';
import { useWritingModeMutation } from '@/components/setup/useSetupOnboarding';
import { useTranslation } from '@/i18n/client';

const MODE_KEYS = {
  copilot: {
    title: 'setup.writingMode.copilot.title',
    description: 'setup.writingMode.copilot.description',
  },
  'llm-wiki': {
    title: 'setup.writingMode.llmWiki.title',
    description: 'setup.writingMode.llmWiki.description',
  },
} as const;

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
        <fieldset className="space-y-sm">
          <legend className="sr-only">{t('setup.writingMode.title')}</legend>
          {(Object.keys(MODE_KEYS) as WritingMode[]).map((option) => {
            const selected = mode === option;
            const copy = MODE_KEYS[option];
            return (
              <label
                key={option}
                className={
                  selected
                    ? 'flex cursor-pointer items-start gap-md rounded-lg border-2 border-primary bg-primary/10 p-md'
                    : 'flex cursor-pointer items-start gap-md rounded-lg border border-border p-md hover:border-border-strong'
                }
              >
                <input
                  className="mt-xs"
                  type="radio"
                  name="writing-mode"
                  value={option}
                  checked={selected}
                  onChange={() => setMode(option)}
                />
                <span>
                  <span className="flex items-center gap-sm text-sm font-medium">
                    {t(copy.title)}
                    {option === 'copilot' && (
                      <span className="rounded bg-primary px-xs py-px text-xs font-medium text-primary-text">
                        {t('setup.writingMode.recommended')}
                      </span>
                    )}
                  </span>
                  <span className="mt-xs block text-sm text-muted">{t(copy.description)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <Button onClick={() => mutation.mutate({ mode })} disabled={mutation.isPending}>
          {mutation.isPending ? t('setup.writingMode.saving') : t('setup.writingMode.continue')}
        </Button>
      </div>
    </StepPanel>
  );
}
