import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { RequestLogPanel } from '@/components/admin/RequestLogPanel';
import { getCurrentActor } from '@/server/services/auth';
import { getRequestLogSettings, listRequestLogs } from '@/server/services/request-log';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getDictionary(locale)('admin.requestLog.metadataTitle') };
}
export default async function RequestLogPage() {
  const actor = await getCurrentActor();
  const initial = await Promise.all([
    getRequestLogSettings({ actor }),
    listRequestLogs({ actor }, { page: 1, pageSize: 20 }),
  ]).catch(() => null);
  if (!initial) notFound();
  const [initialSettings, initialData] = initial;
  return (
    <Layout admin>
      <div className="px-lg py-md">
        <RequestLogPanel initialSettings={initialSettings} initialData={initialData} />
      </div>
    </Layout>
  );
}
