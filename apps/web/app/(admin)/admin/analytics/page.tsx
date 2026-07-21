import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AnalyticsProvidersForm } from '@/components/admin/analytics/AnalyticsProvidersForm';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { readAnalyticsSettings } from '@/server/services/analytics';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const actor = await getCurrentActor();
  if (!can({ actor }, 'manage_appearance', { kind: 'appearance' })) notFound();

  const view = await readAnalyticsSettings({ actor });
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.analytics.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.analytics.description')}</p>
        </div>
        <AnalyticsProvidersForm initial={view} />
      </div>
    </Layout>
  );
}
