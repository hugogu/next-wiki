'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PreferencesView, UpdatePreferencesInput } from '@next-wiki/shared';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';
import { Switch } from '@/components/ui/Switch';

export function WebResearchSettingsForm({
  initial,
  entitled,
  available,
}: {
  initial: PreferencesView;
  entitled: boolean;
  available: boolean;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initial.webResearchPreference);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useApiMutation<UpdatePreferencesInput, PreferencesView>('/api/user/preferences', {
    method: 'PATCH',
  });

  async function save(next: boolean) {
    setEnabled(next);
    setError(null);
    setSaved(false);
    try {
      const result = await mutation.mutateAsync({ webResearchPreference: next });
      setEnabled(result.webResearchPreference);
      setSaved(true);
    } catch (value) {
      setEnabled(enabled);
      setError((value as ApiError).message ?? t('userCenter.webResearch.error'));
    }
  }

  const canEnable = entitled && available;

  return (
    <div className="max-w-2xl space-y-lg">
      <section className="space-y-md rounded-lg border border-border bg-surface p-lg">
        <div>
          <h2 className="font-display text-lg font-semibold">{t('userCenter.webResearch.title')}</h2>
          <p className="mt-xs text-sm text-muted">{t('userCenter.webResearch.description')}</p>
        </div>

        <div className="flex items-start justify-between gap-md rounded-md border border-border p-md">
          <div>
            <p className="text-sm font-medium">{t('userCenter.webResearch.enabled')}</p>
            <p className="mt-xs text-xs text-muted">{t('userCenter.webResearch.enabledHint')}</p>
          </div>
          <Switch
            checked={enabled}
            onClick={() => { void save(!enabled); }}
            disabled={!canEnable || mutation.isPending}
            aria-label={t('userCenter.webResearch.enabled')}
          />
        </div>

        {!entitled && <p className="text-sm text-muted">{t('userCenter.webResearch.notEntitled')}</p>}
        {entitled && !available && <p className="text-sm text-muted">{t('userCenter.webResearch.notConfigured')}</p>}
        {saved && <p className="text-sm text-success" role="status">{t('userCenter.webResearch.saved')}</p>}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </section>

      <p className="text-sm text-muted">
        {t('userCenter.webResearch.privacy')}{' '}
        <Link className="text-primary hover:underline" href="/user-center/profile">{t('userCenter.webResearch.profileLink')}</Link>
      </p>
    </div>
  );
}
