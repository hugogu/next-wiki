'use client';

import { useEffect } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useTranslation } from '@/i18n/client';
import { isLocale } from '@/i18n/config';

const THEME_MODES = new Set(['light', 'dark', 'auto']);

/**
 * Lets an embedder (e.g. the project home page's <iframe>) force the
 * initial language/theme via ?lang=en&theme=dark, so the embedded instance
 * visually matches its host page. Applied once on mount through the same
 * setLocale/setMode paths the in-app switchers use, so it persists (cookie/
 * localStorage) exactly like a manual switch would — not a separate,
 * one-off embed mode.
 */
export function EmbedPreferencesBootstrap() {
  const { setLocale } = useTranslation();
  const { setMode } = useTheme();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get('lang');
    if (isLocale(lang)) setLocale(lang);

    const theme = params.get('theme');
    if (theme && THEME_MODES.has(theme)) setMode(theme as 'light' | 'dark' | 'auto');
    // One-time bootstrap from whatever URL was present on first mount —
    // deliberately not resynced on later client-side navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
