import { Crimson_Pro, Source_Sans_3 } from 'next/font/google';
import { ApiProvider } from '@/lib/api/provider';
import { HistoryProvider } from '@/lib/history';
import { EditorProvider } from '@/components/editor/EditorContext';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${crimsonPro.variable} ${sourceSans.variable}`}>
      <body className="antialiased">
        <ApiProvider>
          <HistoryProvider>
            <EditorProvider>{children}</EditorProvider>
          </HistoryProvider>
        </ApiProvider>
      </body>
    </html>
  );
}
