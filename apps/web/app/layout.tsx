import { ApiProvider } from '@/lib/api/provider';
import { HistoryProvider } from '@/lib/history';
import { EditorProvider } from '@/components/editor/EditorContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getDictionary, getLocale } from '@/i18n/server';
import { getMessages } from '@/i18n/catalog';
import { getCurrentActor } from '@/server/services/auth';
import * as userCenterService from '@/server/services/user-center';
import { getActiveThemeCss } from '@/server/services/system-theme';
import { getActiveAnalyticsScriptContent } from '@/server/services/analytics';
import { getUserAppearance } from '@/server/services/user-appearance';
import { buildUserAppearanceCss } from '@/server/appearance/style';
import { getSiteName } from '@/server/services/site-settings';
import { env } from '@/server/config';
import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const actor = await getCurrentActor();
  const preferences = actor.kind === 'user'
    ? await userCenterService.getPreferences({ actor })
    : null;
  const [siteName, locale] = await Promise.all([getSiteName(), getLocale(preferences?.locale)]);
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
  const actor = await getCurrentActor();
  const preferences = actor.kind === 'user'
    ? await userCenterService.getPreferences({ actor })
    : null;
  const locale = await getLocale(preferences?.locale);

  const systemCss = await getActiveThemeCss();
  const analyticsScriptContent = await getActiveAnalyticsScriptContent();
  let readingThemeCss = '';
  if (actor.kind === 'user') {
    const userAppearance = await getUserAppearance({ actor });
    if (userAppearance.isCustomized) {
      readingThemeCss = buildUserAppearanceCss(userAppearance);
    }
  }

  const initialTheme = preferences?.theme ?? undefined;
  const initialLocale = locale;

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

  // `crypto.randomUUID()` is a secure-context-only API: browsers expose it on
  // `https:` origins and on `localhost`, but not on a plain `http://` origin
  // reached by IP or hostname (e.g. a self-hosted LAN deployment at
  // `http://192.168.x.x:3000`) — regardless of browser version. Unguarded
  // calls throw `TypeError: crypto.randomUUID is not a function` on every
  // page load there. Runs synchronously in <head> before any client bundle so
  // that third-party or future first-party code calling `crypto.randomUUID()`
  // directly still works; first-party code should prefer the `uuid()` helper
  // in @/lib/uuid, which falls back the same way.
  const cryptoRandomUuidPolyfillScript = `
    (function() {
      try {
        var c = window.crypto;
        if (!c || typeof c.randomUUID === 'function') return;
        var getRandomValues = c.getRandomValues;
        if (typeof getRandomValues !== 'function') return;
        c.randomUUID = function() {
          var b = new Uint8Array(16);
          getRandomValues.call(c, b);
          b[6] = (b[6] & 0x0f) | 0x40;
          b[8] = (b[8] & 0x3f) | 0x80;
          var hex = '';
          for (var i = 0; i < 16; i++) {
            var h = b[i].toString(16);
            hex += (h.length === 1 ? '0' + h : h);
          }
          return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32);
        };
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
        <script dangerouslySetInnerHTML={{ __html: cryptoRandomUuidPolyfillScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {analyticsScriptContent ? (
          <script id="app-analytics" dangerouslySetInnerHTML={{ __html: analyticsScriptContent }} />
        ) : null}
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ApplicationI18nProvider initialLocale={initialLocale} messages={getMessages(initialLocale)}>
          <ThemeProvider initialMode={initialTheme}>
            <ApiProvider>
              <HistoryProvider>
                <EditorProvider>{children}</EditorProvider>
              </HistoryProvider>
            </ApiProvider>
          </ThemeProvider>
        </ApplicationI18nProvider>
      </body>
    </html>
  );
}
