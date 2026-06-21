import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { IndexList } from '@/components/admin/ai/IndexList';
import { getCurrentActor } from '@/server/services/auth';
import { listIndexes } from '@/server/services/ai-index';

export const dynamic = 'force-dynamic';
export default async function AiIndexesPage() {
  let indexes;
  try {
    indexes = await listIndexes({ actor: await getCurrentActor() });
  } catch { notFound(); }
  return <Layout admin><div className="space-y-md px-lg py-md"><h1 className="font-display text-xl font-semibold">AI knowledge indexes</h1><IndexList indexes={indexes} /></div></Layout>;
}
