import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { UserAiEntitlementsForm } from '@/components/admin/ai/UserAiEntitlementsForm';
import { getCurrentActor } from '@/server/services/auth';
import { getUserEntitlements } from '@/server/services/ai-entitlements';

export const dynamic = 'force-dynamic';

export default async function UserAiPage({ params }: { params: Promise<{ id: string }> }) {
  let initial;
  try {
    initial = await getUserEntitlements({ actor: await getCurrentActor() }, (await params).id);
  } catch {
    notFound();
  }
  return <Layout admin><div className="space-y-md px-lg py-md"><h1 className="font-display text-xl font-semibold">User AI access</h1><UserAiEntitlementsForm initial={initial} /></div></Layout>;
}
