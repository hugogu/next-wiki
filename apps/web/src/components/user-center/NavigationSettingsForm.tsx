'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NavigationMode, PreferencesView, UpdatePreferencesInput } from '@next-wiki/shared';
import { Select } from '@/components/ui/Select';
import { useTranslation } from '@/i18n/client';
import { useApiMutation, type ApiError } from '@/lib/api/client';

export function NavigationSettingsForm({ initialMode }: { initialMode: NavigationMode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState<string | null>(null);
  const mutation = useApiMutation<UpdatePreferencesInput, PreferencesView>('/api/user/preferences', { method: 'PATCH' });

  async function save(value: NavigationMode) {
    setError(null);
    try {
      const result = await mutation.mutateAsync({ navigationMode: value });
      setMode(result.navigationMode);
      router.refresh();
    } catch (error) {
      setError((error as ApiError).message ?? t('userCenter.webResearch.error'));
    }
  }

  return (
    <section className="max-w-2xl space-y-md rounded-lg border border-border bg-surface p-lg">
      <label htmlFor="navigation-mode" className="block font-display text-lg font-semibold">{t('navigation.settings.title')}</label>
      <p id="navigation-mode-description" className="text-sm text-muted">{t('navigation.settings.description')}</p>
      <Select id="navigation-mode" value={mode} disabled={mutation.isPending} aria-describedby="navigation-mode-description"
        onChange={(event) => { void save(event.target.value as NavigationMode); }}>
        <option value="tree">{t('navigation.settings.tree')}</option>
        <option value="current">{t('navigation.settings.current')}</option>
      </Select>
      {mutation.isSuccess && <p role="status" className="text-sm text-success">{t('navigation.settings.saved')}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </section>
  );
}
