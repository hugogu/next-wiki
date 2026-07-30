'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
  MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
  type TranslationSettingsUpdate,
  type TranslationSettingsView,
} from '@next-wiki/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useApiMutation } from '@/lib/api/client';
import { useTranslation } from '@/i18n/client';

/**
 * Feature-wide translation runtime settings. The request deadline lives here
 * rather than in AI settings because it bounds one whole streamed document, a
 * limit only background translation needs.
 */
export function TranslationRuntimePanel({ settings }: { settings: TranslationSettingsView }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [seconds, setSeconds] = useState(String(settings.requestTimeoutSeconds));

  const save = useApiMutation<TranslationSettingsUpdate, TranslationSettingsView>(
    '/api/translations/settings',
    { method: 'PATCH', onSuccess: () => router.refresh() },
  );

  const value = Number(seconds);
  const valid =
    Number.isInteger(value) &&
    value >= MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS &&
    value <= MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS;

  return (
    <section
      aria-labelledby="translation-runtime-heading"
      className="space-y-sm rounded-lg border border-border p-md"
    >
      <div>
        <h3 id="translation-runtime-heading" className="text-sm font-semibold">
          {t('translation.settings.title')}
        </h3>
        <p className="mt-xs text-sm text-muted">{t('translation.settings.description')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-sm">
        <label className="flex flex-col gap-xs text-sm">
          <span className="font-medium">{t('translation.settings.requestTimeout')}</span>
          <Input
            type="number"
            className="w-40"
            min={MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS}
            max={MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS}
            step={30}
            value={seconds}
            onChange={(event) => setSeconds(event.target.value)}
          />
          <span className="text-xs text-muted">
            {t('translation.settings.requestTimeoutHint', {
              min: MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
              max: MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
            })}
          </span>
        </label>
        <Button
          type="button"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate({ requestTimeoutSeconds: value })}
        >
          {save.isPending ? t('common.status.saving') : t('common.actions.save')}
        </Button>
        {save.isSuccess && !save.isPending && (
          <span role="status" className="text-sm text-muted">
            {t('translation.settings.saved')}
          </span>
        )}
        {save.error && (
          <span role="alert" className="text-sm text-danger">
            {save.error.message}
          </span>
        )}
      </div>
    </section>
  );
}
