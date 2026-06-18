'use client';

import { useTranslation } from '@/i18n/client';
import type { Locale } from '@/i18n/config';

const nextLocale: Record<Locale, Locale> = {
  en: 'zh',
  zh: 'en',
};

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => setLocale(nextLocale[locale])}
      aria-label={locale === 'en' ? 'Switch to Chinese' : '切换到英文'}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md text-sm font-medium text-muted hover:text-foreground hover:bg-surface-elevated transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {locale === 'en' ? '中' : 'En'}
    </button>
  );
}
