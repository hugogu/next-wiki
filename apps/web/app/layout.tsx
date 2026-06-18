import { Crimson_Pro, Source_Sans_3 } from 'next/font/google';
import { ApiProvider } from '@/lib/api/provider';
import { HistoryProvider } from '@/lib/history';
import { EditorProvider } from '@/components/editor/EditorContext';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { I18nProvider } from '@/i18n/client';
import { getLocale } from '@/i18n/server';
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

  return (
    <html
      lang={locale}
      className={`${crimsonPro.variable} ${sourceSans.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased" suppressHydrationWarning>
        <I18nProvider initialLocale={locale}>
          <ThemeProvider>
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
