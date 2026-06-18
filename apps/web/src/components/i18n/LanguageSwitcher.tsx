'use client';

import { useTranslation } from '@/i18n/client';
import { locales, type Locale } from '@/i18n/config';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label={t('language.en')}
      className="h-9 px-2 rounded-md bg-surface border border-border text-sm text-foreground hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {locales.map((loc) => (
        <option key={loc} value={loc}>
          {t(`language.${loc}` as const)}
        </option>
      ))}
    </select>
  );
}
