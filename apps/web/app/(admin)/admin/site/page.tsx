import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SiteSettingsForm } from '@/components/admin/appearance/SiteSettingsForm';
import { DemoModeToggle } from '@/components/admin/appearance/DemoModeToggle';
import { getCurrentActor } from '@/server/services/auth';
import { can, isDemoReadOnly } from '@/server/permissions';
import { getSiteView } from '@/server/services/site-settings';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminSitePage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user') notFound();
  const canManage = can({ actor }, 'manage_appearance', { kind: 'appearance' });
  const canManageDemoMode = can({ actor }, 'manage_demo_mode', { kind: 'demo_mode' });

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
        {canManageDemoMode && <DemoModeToggle enabled={isDemoReadOnly()} />}
        <fieldset disabled={!canManage} className="min-w-0 border-0 p-0 disabled:opacity-70">
          <SiteSettingsForm initial={view} />
        </fieldset>
      </div>
    </Layout>
  );
}
