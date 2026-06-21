import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ProviderForm } from '@/components/admin/ai/ProviderForm';
import { ProviderList } from '@/components/admin/ai/ProviderList';
import { getCurrentActor } from '@/server/services/auth';
import { listProviders } from '@/server/services/ai-admin';

export const dynamic = 'force-dynamic';

export default async function AiProvidersPage() {
  let providers;
  try {
    providers = await listProviders({ actor: await getCurrentActor() });
  } catch {
    notFound();
  }
  return <Layout admin><div className="space-y-md px-lg py-md"><h1 className="font-display text-xl font-semibold">AI Providers</h1><ProviderForm /><ProviderList providers={providers} /></div></Layout>;
}
