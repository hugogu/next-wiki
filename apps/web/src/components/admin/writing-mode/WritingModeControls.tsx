'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { WritingMode } from '@next-wiki/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { apiGet, useApiMutation, type ApiError } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';
import { SwitchModeDialog } from './SwitchModeDialog';

type SwitchState = {
  mode: WritingMode;
  pendingMode: WritingMode | null;
  switchJobId: string | null;
};

type SwitchJob = {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  report: {
    conflicts?: Array<{ sourcePath: string; destinationPath: string }>;
  } | null;
};

const ACTIVE_JOB_STATUSES = new Set<SwitchJob['status']>(['pending', 'running']);

export function WritingModeControls({ initial }: { initial: SwitchState }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(initial.switchJobId);
  const [error, setError] = useState<string | null>(null);
  const job = useQuery({
    queryKey: ['writing-mode-switch', jobId],
    enabled: jobId !== null,
    queryFn: () => apiGet<SwitchJob>(`/api/settings/writing-mode/jobs/${jobId}`),
    refetchInterval: (query) => ACTIVE_JOB_STATUSES.has(query.state.data?.status ?? 'pending') ? 1500 : false,
  });
  const switchForward = useApiMutation<{ mode: 'llm-wiki' }, { mode: 'llm-wiki' }>(
    '/api/settings/writing-mode',
    { method: 'PUT' },
  );

  const active = initial.pendingMode !== null || (job.data && ACTIVE_JOB_STATUSES.has(job.data.status));
  const failure = job.data?.status === 'failed';
  const conflictPaths = job.data?.report?.conflicts ?? [];

  useEffect(() => {
    if (job.data?.status === 'completed' || job.data?.status === 'failed') router.refresh();
  }, [job.data?.status, router]);

  const enableLlmWiki = () => {
    setError(null);
    switchForward.mutate({ mode: 'llm-wiki' }, {
      onSuccess: () => router.refresh(),
      onError: (response: ApiError) => setError(response.message),
    });
  };

  const accepted = (nextJobId: string) => {
    setDialogOpen(false);
    setJobId(nextJobId);
    router.refresh();
  };

  return (
    <section className="max-w-3xl border-b border-border py-md">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h2 className="text-sm font-medium">{t('admin.writingMode.changeLabel')}</h2>
          {active && <p className="mt-xs text-sm text-muted">{t('admin.writingMode.pending')}</p>}
        </div>
        {initial.mode === 'copilot' ? (
          <Button onClick={enableLlmWiki} disabled={active || switchForward.isPending}>
            {switchForward.isPending ? t('admin.writingMode.switching') : t('admin.writingMode.switchToLlmWiki')}
          </Button>
        ) : (
          <Button variant="danger" onClick={() => setDialogOpen(true)} disabled={active}>
            {t('admin.writingMode.switchToCopilot')}
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {job.data && (
        <div className="mt-md space-y-sm text-sm">
          <p className={failure ? 'text-danger' : 'text-muted'}>
            {t(`admin.writingMode.job.${job.data.status}`)}
          </p>
          {failure && initial.mode === 'llm-wiki' && !initial.pendingMode && (
            <Button variant="secondary" onClick={() => setDialogOpen(true)}>{t('admin.writingMode.retry')}</Button>
          )}
          {job.data.status === 'completed' && conflictPaths.length > 0 && (
            <div>
              <p className="font-medium">{t('admin.writingMode.job.conflicts')}</p>
              <ul className="mt-xs list-disc space-y-xs pl-lg text-muted">
                {conflictPaths.map((conflict) => (
                  <li key={`${conflict.sourcePath}:${conflict.destinationPath}`}>
                    {conflict.sourcePath} → {conflict.destinationPath}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {dialogOpen && <SwitchModeDialog onAccepted={accepted} onClose={() => setDialogOpen(false)} />}
    </section>
  );
}
