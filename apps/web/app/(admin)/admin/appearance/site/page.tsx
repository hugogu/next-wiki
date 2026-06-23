import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AppearanceNav } from '@/components/admin/appearance/AppearanceNav';
import { SiteSettingsForm } from '@/components/admin/appearance/SiteSettingsForm';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getSiteView } from '@/server/services/site-settings';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminSitePage() {
  const actor = await getCurrentActor();
  if (!can({ actor }, 'manage_appearance', { kind: 'appearance' })) notFound();

  const view = await getSiteView();
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.site.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.site.description')}</p>
        </div>
        <AppearanceNav />
        <SiteSettingsForm initial={view} />
      </div>
    </Layout>
  );
}
