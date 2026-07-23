import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AiPromptsPanel } from '@/components/admin/ai/AiPromptsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getAiRuntimeSettings } from '@/server/services/ai-runtime-settings';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return { title: t('admin.ai.prompts.title') };
}

export default async function AdminAiPromptsPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) {
    notFound();
  }
  const runtimeSettings = await getAiRuntimeSettings({ actor });
  const t = getDictionary(await getLocale());

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.ai.prompts.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.ai.prompts.description')}</p>
        </div>
        <AiPromptsPanel initial={runtimeSettings} />
      </div>
    </Layout>
  );
}
