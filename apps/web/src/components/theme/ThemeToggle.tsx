'use client';

import { useTranslation } from '@/i18n/client';
import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { t } = useTranslation();
  const { mode, resolved, cycle } = useTheme();

  const modeLabel =
    mode === 'auto'
      ? t('theme.mode.autoWithResolved', { resolved: t(`theme.mode.${resolved}` as const) })
      : t(`theme.mode.${mode}` as const);

  const label = t('theme.toggleLabel', { mode: modeLabel });

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-foreground hover:bg-surface-elevated transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {mode === 'light' && (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      )}
      {mode === 'dark' && (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      {mode === 'auto' && (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )}
    </button>
  );
}
