import { ApiProvider } from '@/lib/api/provider';
import { HistoryProvider } from '@/lib/history';
import { EditorProvider } from '@/components/editor/EditorContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { I18nProvider } from '@/i18n/client';
import { getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import * as userCenterService from '@/server/services/user-center';
import { getAppearanceSettings } from '@/server/services/appearance-settings';
import { buildAppearanceStyleCss } from '@/server/appearance/style';
import { getSiteName } from '@/server/services/site-settings';
import { getActiveThemeCss } from '@/server/services/markdown-themes';
import { scopeThemeCss } from '@/server/appearance/css-sanitize';
import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSiteName();
  return {
    title: { default: siteName, template: `%s · ${siteName}` },
    icons: { icon: '/api/settings/site/icon' },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const actor = await getCurrentActor();
  const preferences = actor.kind === 'user'
    ? await userCenterService.getPreferences({ actor })
    : null;

  const appearanceCss = buildAppearanceStyleCss(await getAppearanceSettings());
  const userId = actor.kind === 'user' ? actor.userId : null;
  const markdownThemeCss = scopeThemeCss(await getActiveThemeCss(userId));

  const initialTheme = preferences?.theme ?? undefined;
  const initialLocale = preferences?.locale ?? locale;

  const themeScript = `
    (function() {
      try {
        var stored = localStorage.getItem('next-wiki-theme');
        var mode = stored || '${initialTheme ?? 'auto'}';
        var resolved = mode === 'auto'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : mode;
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(resolved);
      } catch (e) {}
    })();
  `;

  return (
    <html
      lang={initialLocale}
      suppressHydrationWarning
    >
      <head>
        <style id="app-appearance" dangerouslySetInnerHTML={{ __html: appearanceCss }} />
        <style id="app-md-theme" dangerouslySetInnerHTML={{ __html: markdownThemeCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <I18nProvider initialLocale={initialLocale}>
          <ThemeProvider initialMode={initialTheme}>
            <ApiProvider>
              <HistoryProvider>
                <EditorProvider>{children}</EditorProvider>
              </HistoryProvider>
            </ApiProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
