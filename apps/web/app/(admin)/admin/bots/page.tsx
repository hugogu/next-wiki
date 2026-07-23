import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { BotsTabs } from '@/components/admin/bots/BotsTabs';
import { can } from '@/server/permissions';
import { getCurrentActor } from '@/server/services/auth';
import { getConfigView } from '@/server/services/feishu-config';
import { listDataSources } from '@/server/services/content-data-sources';
import { readBotGeneralSettings } from '@/server/services/bot-settings';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return { title: t('admin.bots.title') };
}

export default async function AdminBotsPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) notFound();

  const locale = await getLocale();
  const t = getDictionary(locale);
  const [config, dataSources, generalSettings] = await Promise.all([
    getConfigView({ actor }),
    listDataSources({ actor }),
    readBotGeneralSettings({ actor }),
  ]);
  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.bots.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.bots.description')}</p>
        </div>
        <BotsTabs feishuConfig={config} dataSources={dataSources} generalSettings={generalSettings} />
      </div>
    </Layout>
  );
}
