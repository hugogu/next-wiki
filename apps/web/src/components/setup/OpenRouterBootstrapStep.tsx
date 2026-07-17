'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SetupAiResult, SetupPurposeResult, SetupStateView } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useAiBootstrapMutation, type ApiError } from '@/components/setup/useSetupOnboarding';

const PURPOSE_LABEL_KEYS = {
  wiki_text: 'setup.ai.purposes.wiki_text',
  wiki_embedding: 'setup.ai.purposes.wiki_embedding',
  wiki_image: 'setup.ai.purposes.wiki_image',
} as const;

const PURPOSE_STATUS_KEYS = {
  configured: 'setup.ai.purposeStatus.configured',
  skipped: 'setup.ai.purposeStatus.skipped',
  unavailable: 'setup.ai.purposeStatus.unavailable',
  needs_manual_setup: 'setup.ai.purposeStatus.needs_manual_setup',
  failed: 'setup.ai.purposeStatus.failed',
} as const;

export function PurposeResultList({ purposes }: { purposes: SetupAiResult | null }) {
  const { t } = useTranslation();
  if (!purposes) return null;
  const entries = (Object.keys(PURPOSE_LABEL_KEYS) as Array<keyof typeof PURPOSE_LABEL_KEYS>)
    .map((key) => ({ key, result: purposes[key] as SetupPurposeResult | undefined }))
    .filter((entry): entry is { key: keyof typeof PURPOSE_LABEL_KEYS; result: SetupPurposeResult } => Boolean(entry.result));
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-xs text-sm">
      {entries.map(({ key, result }) => (
        <li key={key} className="flex items-start justify-between gap-md">
          <span>{t(PURPOSE_LABEL_KEYS[key])}</span>
          <span className={result.status === 'configured' ? 'text-success' : result.status === 'failed' ? 'text-danger' : 'text-muted'}>
            {t(PURPOSE_STATUS_KEYS[result.status])}
            {result.modelName ? ` · ${result.modelName}` : ''}
            {result.reason ? ` — ${result.reason}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function errorMessageKey(error: ApiError): string {
  switch (error.code) {
    case 'PROVIDER_AUTH_FAILED':
      return 'setup.ai.error.authFailed';
    case 'RATE_LIMITED':
      return 'setup.ai.error.rateLimited';
    case 'TIMEOUT':
      return 'setup.ai.error.timeout';
    case 'PROVIDER_UNAVAILABLE':
      return 'setup.ai.error.unavailable';
    default:
      return 'setup.ai.error.generic';
  }
}

/**
 * Optional OpenRouter bootstrap step: validate a key and queue model sync, or
 * skip AI entirely. Queued progress is polled through the shared setup-state
 * query; failures stay retryable without losing the Admin account.
 */
export function OpenRouterBootstrapStep({ state }: { state: SetupStateView }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [autoAssign, setAutoAssign] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['setup-state'] });

  const mutation = useAiBootstrapMutation({
    onSuccess: () => {
      setApiKey('');
      setError(null);
      refresh();
    },
    onError: (err) => {
      if (err.code === 'AI_DISABLED') {
        refresh();
        return;
      }
      setError(t(errorMessageKey(err) as Parameters<typeof t>[0]));
    },
  });

  const status = state.aiStatus ?? 'not_started';
  const purposes = state.summary?.ai ?? null;

  if (status === 'queued' || status === 'running') {
    return (
      <div className="space-y-md">
        <h2 className="text-lg font-medium">{t('setup.ai.title')}</h2>
        <p className="text-sm text-muted" role="status">
          {status === 'queued' ? t('setup.ai.queued') : t('setup.ai.running')} {t('setup.ai.polling')}
        </p>
      </div>
    );
  }

  if (status === 'completed' || status === 'partial' || status === 'skipped') {
    return (
      <div className="space-y-md">
        <h2 className="text-lg font-medium">{t('setup.ai.title')}</h2>
        <PurposeResultList purposes={purposes} />
      </div>
    );
  }

  if (status === 'disabled') {
    return (
      <div className="space-y-md">
        <h2 className="text-lg font-medium">{t('setup.ai.title')}</h2>
        <Alert>{t('setup.ai.disabled')}</Alert>
        <Button
          onClick={() => mutation.mutate({ mode: 'skip' })}
          disabled={mutation.isPending}
        >
          {t('setup.ai.skip')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-md">
      <div>
        <h2 className="text-lg font-medium">{t('setup.ai.title')}</h2>
        <p className="text-sm text-muted mt-xs">{t('setup.ai.description')}</p>
      </div>
      {error && <Alert>{error}</Alert>}
      {status === 'failed' && purposes && <PurposeResultList purposes={purposes} />}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate({ mode: 'configure', apiKey, autoAssign });
        }}
        className="space-y-md"
      >
        <div>
          <label htmlFor="openrouter-key" className="block text-sm font-medium mb-sm">
            {t('setup.ai.keyLabel')}
          </label>
          <Input
            id="openrouter-key"
            type="password"
            autoComplete="off"
            placeholder={t('setup.ai.keyPlaceholder')}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <p className="text-xs text-muted mt-xs">{t('setup.ai.keyHelp')}</p>
        </div>
        <label className="flex items-center gap-sm text-sm">
          <input
            type="checkbox"
            checked={autoAssign}
            onChange={(event) => setAutoAssign(event.target.checked)}
          />
          {t('setup.ai.autoAssignLabel')}
        </label>
        <div className="flex gap-sm">
          <Button type="submit" disabled={mutation.isPending || apiKey.trim().length === 0}>
            {mutation.isPending ? t('setup.ai.configuring') : status === 'failed' ? t('setup.ai.retry') : t('setup.ai.configure')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => mutation.mutate({ mode: 'skip' })}
            disabled={mutation.isPending}
          >
            {t('setup.ai.skip')}
          </Button>
        </div>
      </form>
    </div>
  );
}
