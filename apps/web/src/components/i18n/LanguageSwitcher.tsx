'use client';

import { useTranslation } from '@/i18n/client';
import type { Locale } from '@/i18n/config';
import { useApiMutation } from '@/lib/api/client';
import type { UpdatePreferencesInput, PreferencesView } from '@next-wiki/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const nextLocale: Record<Locale, Locale> = {
  en: 'zh',
  zh: 'en',
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState(false);
  const mutation = useApiMutation<UpdatePreferencesInput, PreferencesView>('/api/user/preferences', {
    method: 'PATCH',
  });

  return (
    <button
      type="button"
      onClick={async () => {
        const next = nextLocale[locale];
        setError(false);
        const previous = locale;
        setLocale(next);
        try {
          await mutation.mutateAsync({ locale: next });
          router.refresh();
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === 'UNAUTHORIZED') return;
          setLocale(previous);
          setError(true);
        }
      }}
      aria-label={locale === 'en' ? t('language.switchToChinese') : t('language.switchToEnglish')}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md text-sm font-medium text-muted hover:text-foreground hover:bg-surface-elevated transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {error ? '!' : locale === 'en' ? '中' : 'En'}
    </button>
  );
}
