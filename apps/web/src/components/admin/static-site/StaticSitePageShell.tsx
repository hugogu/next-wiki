import type { ReactNode } from 'react';
import { Layout } from '@/components/ui/Layout';
import { getLocale, getDictionary } from '@/i18n/server';
import { StaticSiteTabs } from './StaticSiteTabs';

/** Shared header and section tabs for the static site publishing pages. */
export async function StaticSitePageShell({ children, canManage = true }: { children: ReactNode; canManage?: boolean }) {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.staticSite.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.staticSite.description')}</p>
        </div>
        {canManage && <StaticSiteTabs />}
        {children}
      </div>
    </Layout>
  );
}
