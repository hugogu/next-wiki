import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AiSettingsPanel } from '@/components/admin/ai/AiSettingsPanel';
import { PurposeAssignments } from '@/components/admin/ai/PurposeAssignments';
import { getCurrentActor } from '@/server/services/auth';
import { listModels, readSettings } from '@/server/services/ai-admin';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminAiPage() {
  const actor = await getCurrentActor();
  let data;
  try {
    data = await Promise.all([
      readSettings({ actor }),
      listModels({ actor }),
    ]);
  } catch {
    notFound();
  }
  const [settings, models] = data;
  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <h1 className="font-display text-xl font-semibold">AI</h1>
        <div className="flex flex-wrap gap-sm text-sm">
          <Link className="text-primary hover:underline" href="/admin/ai/providers">Providers</Link>
          <Link className="text-primary hover:underline" href="/admin/ai/models">Models</Link>
          <Link className="text-primary hover:underline" href="/admin/ai/indexes">Indexes</Link>
          <Link className="text-primary hover:underline" href="/admin/ai/actions">Actions</Link>
        </div>
        <AiSettingsPanel enabled={settings.enabled} />
        <PurposeAssignments models={models} assignments={settings.assignments} />
      </div>
    </Layout>
  );
}
