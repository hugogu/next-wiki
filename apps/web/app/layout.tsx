import { Crimson_Pro, Source_Sans_3 } from 'next/font/google';
import { ApiProvider } from '@/lib/api/provider';
import { HistoryProvider } from '@/lib/history';
import { EditorProvider } from '@/components/editor/EditorContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { I18nProvider } from '@/i18n/client';
import { getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import * as userCenterService from '@/server/services/user-center';
import 'katex/dist/katex.min.css';
import './globals.css';

const crimsonPro = Crimson_Pro({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const actor = await getCurrentActor();
  const preferences = actor.kind === 'user'
    ? await userCenterService.getPreferences({ actor })
    : null;

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
      className={`${crimsonPro.variable} ${sourceSans.variable}`}
      suppressHydrationWarning
    >
      <head>
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
