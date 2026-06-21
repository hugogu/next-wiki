import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ModelCatalog } from '@/components/admin/ai/ModelCatalog';
import { getCurrentActor } from '@/server/services/auth';
import { listModels } from '@/server/services/ai-admin';

export const dynamic = 'force-dynamic';

export default async function AiModelsPage() {
  let models;
  try {
    models = await listModels({ actor: await getCurrentActor() });
  } catch {
    notFound();
  }
  return <Layout admin><div className="space-y-md px-lg py-md"><h1 className="font-display text-xl font-semibold">AI Models</h1><ModelCatalog models={models} /></div></Layout>;
}
