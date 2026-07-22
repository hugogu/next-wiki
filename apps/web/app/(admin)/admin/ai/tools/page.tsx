import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AiToolsPanel } from '@/components/admin/ai/AiToolsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { listToolsWithEffectivePolicy } from '@/server/services/ai-tool-policy';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAiToolsPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) {
    notFound();
  }

  const data = await listToolsWithEffectivePolicy({ actor });
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.ai.tools.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.ai.tools.description')}</p>
        </div>
        <AiToolsPanel initial={data} />
      </div>
    </Layout>
  );
}
