import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { SkillDetail } from '@/components/admin/ai/SkillDetail';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getSkillForAdmin } from '@/server/services/skills/admin';
import { DomainError } from '@/server/errors';

export const dynamic = 'force-dynamic';

export default async function AdminAiSkillDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || !can({ actor }, 'manage_ai', { kind: 'ai_settings' })) {
    notFound();
  }

  const { name } = await params;
  const skill = await getSkillForAdmin({ actor }, name).catch((error: unknown) => {
    if (error instanceof DomainError) return null;
    throw error;
  });
  if (!skill) notFound();

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <SkillDetail skill={skill} />
      </div>
    </Layout>
  );
}
