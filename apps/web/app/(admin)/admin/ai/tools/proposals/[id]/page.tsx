import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ToolProposalDetail } from '@/components/admin/ai/ToolProposalDetail';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { getProposalDetail } from '@/server/services/ai-tool-proposals';

export const dynamic = 'force-dynamic';

export default async function AdminToolProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) {
    notFound();
  }
  let detail;
  try {
    detail = await getProposalDetail({ actor }, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <Layout admin>
      <div className="px-lg py-md">
        <ToolProposalDetail initial={detail} />
      </div>
    </Layout>
  );
}
