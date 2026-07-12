'use client';

import { useRouter } from 'next/navigation';
import type { TranslationRunView } from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { PauseIcon, PlayIcon, RedoIcon, XIcon } from '@/components/icons';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

/**
 * Durable, conflict-safe run controls shared by the run list and the run detail
 * view. Each button is gated by the server-computed `can*` flags so illegal
 * transitions are never offered.
 */
export function TranslationRunControls({ run }: { run: TranslationRunView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pause = useApiMutation(`/api/translations/runs/${run.id}/pause`);
  const resume = useApiMutation(`/api/translations/runs/${run.id}/resume`);
  const cancel = useApiMutation(`/api/translations/runs/${run.id}/cancellation`);
  const retry = useApiMutation<Record<string, never>>(`/api/translations/runs/${run.id}/retries`);

  const refresh = () => router.refresh();

  if (!run.canPause && !run.canResume && !run.canCancel && !run.canRetry) return null;

  return (
    <div className="flex items-center gap-xs">
      {run.canPause && !run.pauseRequested && (
        <Tooltip label={t('translation.run.pause')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('translation.run.pause')}
            disabled={pause.isPending}
            onClick={() => pause.mutate(undefined, { onSuccess: refresh })}
          >
            <PauseIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {run.canResume && (
        <Tooltip label={t('translation.run.resume')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('translation.run.resume')}
            disabled={resume.isPending}
            onClick={() => resume.mutate(undefined, { onSuccess: refresh })}
          >
            <PlayIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {run.canCancel && (
        <Tooltip label={t('translation.run.cancel')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('translation.run.cancel')}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(undefined, { onSuccess: refresh })}
          >
            <XIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
      {run.canRetry && (
        <Tooltip label={t('translation.run.retry')}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('translation.run.retry')}
            disabled={retry.isPending}
            onClick={() => retry.mutate({}, { onSuccess: refresh })}
          >
            <RedoIcon className="h-4 w-4" />
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

export function runStatusTone(status: TranslationRunView['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'completed_with_warnings') return 'warning' as const;
  if (status === 'failed' || status === 'cancelled') return 'danger' as const;
  if (status === 'paused') return 'neutral' as const;
  return 'info' as const;
}
