import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ProviderDetail } from '@/components/admin/ai/ProviderDetail';
import { getCurrentActor } from '@/server/services/auth';
import { getProvider } from '@/server/services/ai-admin';

export const dynamic = 'force-dynamic';

export default async function AiProviderPage({ params }: { params: Promise<{ id: string }> }) {
  let provider;
  try {
    provider = await getProvider({ actor: await getCurrentActor() }, (await params).id);
  } catch {
    notFound();
  }
  return <Layout admin><div className="space-y-md px-lg py-md"><h1 className="font-display text-xl font-semibold">{provider.name}</h1><ProviderDetail provider={provider} /></div></Layout>;
}
