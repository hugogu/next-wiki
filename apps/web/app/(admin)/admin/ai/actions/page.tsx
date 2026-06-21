import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AiActionAuditTable } from '@/components/admin/ai/AiActionAuditTable';
import { getCurrentActor } from '@/server/services/auth';
import { listActions } from '@/server/services/ai-actions';

export const dynamic = 'force-dynamic';

export default async function AdminAiActionsPage() {
  const actor = await getCurrentActor();
  let actions;
  try {
    actions = await listActions({ actor }, { limit: 200 });
  } catch {
    notFound();
  }
  return (
    <Layout admin>
      <div className="px-lg py-md">
        <AiActionAuditTable actions={actions} />
      </div>
    </Layout>
  );
}
