import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { IndexDetail } from '@/components/admin/ai/IndexDetail';
import { getCurrentActor } from '@/server/services/auth';
import { getIndex } from '@/server/services/ai-index';

export const dynamic = 'force-dynamic';
export default async function AiIndexPage({ params }: { params: Promise<{ id: string }> }) {
  let index;
  try {
    index = await getIndex({ actor: await getCurrentActor() }, (await params).id);
  } catch { notFound(); }
  return <Layout admin><div className="space-y-md px-lg py-md"><IndexDetail index={index} /></div></Layout>;
}
