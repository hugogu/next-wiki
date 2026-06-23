import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AppearanceForm } from '@/components/admin/appearance/AppearanceForm';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getAppearanceView } from '@/server/services/appearance-settings';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAppearancePage() {
  const actor = await getCurrentActor();
  if (!can({ actor }, 'manage_appearance', { kind: 'appearance' })) notFound();

  const view = await getAppearanceView();
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.appearance.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.appearance.description')}</p>
        </div>
        <AppearanceForm initial={view} />
      </div>
    </Layout>
  );
}
