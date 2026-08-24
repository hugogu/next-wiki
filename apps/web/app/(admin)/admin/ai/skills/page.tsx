import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SkillsPanel } from '@/components/admin/ai/SkillsPanel';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { listSkillsForAdmin } from '@/server/services/skills/admin';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export default async function AdminAiSkillsPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user') {
    notFound();
  }
  const canManage = can({ actor }, 'manage_ai', { kind: 'ai_settings' });

  const catalogue = await listSkillsForAdmin({ actor });
  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.ai.skills.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.ai.skills.description')}</p>
        </div>
        <SkillsPanel catalogue={catalogue} canManage={canManage} />
      </div>
    </Layout>
  );
}
