import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AiSettingsPanel } from '@/components/admin/ai/AiSettingsPanel';
import { AiAdminTabs } from '@/components/admin/ai/AiAdminTabs';
import { getCurrentActor } from '@/server/services/auth';
import { listModels, listProviders, readSettings } from '@/server/services/ai-admin';
import { listIndexes } from '@/server/services/ai-index';
import { listActions } from '@/server/services/ai-actions';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAiPage() {
  const actor = await getCurrentActor();
  let data;
  try {
    data = await Promise.all([
      readSettings({ actor }),
      listProviders({ actor }),
      listModels({ actor }),
      listIndexes({ actor }),
      listActions({ actor }, { limit: 20 }),
    ]);
  } catch {
    notFound();
  }
  const [settings, providers, models, indexes, actions] = data;
  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div className="flex items-start justify-between gap-md">
          <div>
            <h1 className="font-display text-xl font-semibold">{t('admin.ai.title')}</h1>
            <p className="mt-xs text-sm text-muted">{t('admin.ai.description')}</p>
          </div>
          <AiSettingsPanel enabled={settings.enabled} />
        </div>
        <AiAdminTabs
          providers={providers}
          models={models}
          assignments={settings.assignments}
          indexes={indexes}
          actions={actions.items}
          actionsTotal={actions.total}
          hasModelDetectorApiKey={settings.hasModelDetectorApiKey}
        />
      </div>
    </Layout>
  );
}
