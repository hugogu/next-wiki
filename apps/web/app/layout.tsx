import { ApiProvider } from '@/lib/api/provider';
import { HistoryProvider } from '@/lib/history';
import { EditorProvider } from '@/components/editor/EditorContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { I18nProvider } from '@/i18n/client';
import { getDictionary, getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import * as userCenterService from '@/server/services/user-center';
import { getActiveThemeCss } from '@/server/services/system-theme';
import { getUserAppearance } from '@/server/services/user-appearance';
import { buildUserAppearanceCss } from '@/server/appearance/style';
import { getSiteName } from '@/server/services/site-settings';
import { env } from '@/server/config';
import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const [siteName, locale] = await Promise.all([getSiteName(), getLocale()]);
  const t = getDictionary(locale);
  const description = t('site.description');
  // APP_URL is validated to a URL at boot. Strip a trailing slash so it
  // composes cleanly with path joins.
  const siteUrl = env.APP_URL.replace(/\/$/, '');
  return {
    title: { default: siteName, template: `%s · ${siteName}` },
    description,
    applicationName: siteName,
    icons: {
      icon: '/api/settings/site/icon',
      apple: '/api/settings/site/icon',
    },
    alternates: {
      canonical: `${siteUrl}/`,
    },
    openGraph: {
      type: 'website',
      url: `${siteUrl}/`,
      siteName,
      title: siteName,
      description,
      locale: locale === 'zh' ? 'zh_CN' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: siteName,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const actor = await getCurrentActor();
  const preferences = actor.kind === 'user'
    ? await userCenterService.getPreferences({ actor })
    : null;

  const systemCss = await getActiveThemeCss();
  let readingThemeCss = '';
  if (actor.kind === 'user') {
    const userAppearance = await getUserAppearance({ actor });
    if (userAppearance.isCustomized) {
      readingThemeCss = buildUserAppearanceCss(userAppearance);
    }
  }

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
        <style id="app-system-theme" dangerouslySetInnerHTML={{ __html: systemCss }} />
        <style id="app-reading-theme" dangerouslySetInnerHTML={{ __html: readingThemeCss }} />
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
