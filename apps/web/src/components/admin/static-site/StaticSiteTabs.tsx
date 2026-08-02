'use client';

import { RouteTabs } from '@/components/ui/RouteTabs';
import { useTranslation } from '@/i18n/client';

/** Section navigation shared by the overview, settings, and history pages. */
export function StaticSiteTabs() {
  const { t } = useTranslation();
  return (
    <RouteTabs
      items={[
        { href: '/admin/static-site', label: t('admin.staticSite.tabs.overview'), exact: true },
        { href: '/admin/static-site/settings', label: t('admin.staticSite.tabs.settings') },
        { href: '/admin/static-site/history', label: t('admin.staticSite.tabs.history') },
      ]}
    />
  );
}
