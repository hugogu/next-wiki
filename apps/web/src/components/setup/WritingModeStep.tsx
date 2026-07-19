'use client';

import { useState } from 'react';
import type { WritingMode } from '@next-wiki/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StepPanel } from '@/components/setup/StepPanel';
import { WritingModeOptionCards } from '@/components/setup/WritingModeOptionCards';
import { useWritingModeMutation } from '@/components/setup/useSetupOnboarding';
import { useTranslation } from '@/i18n/client';

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
          <WritingModeOptionCards selectedMode={mode} onSelect={setMode} showRecommendedBadge />
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
