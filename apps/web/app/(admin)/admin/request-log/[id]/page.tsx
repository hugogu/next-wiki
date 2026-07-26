import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { RequestLogDetail } from '@/components/admin/RequestLogDetail';
import { getCurrentActor } from '@/server/services/auth';
import { getRequestLogDetail } from '@/server/services/request-log';
import { getDictionary, getLocale } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getDictionary(locale)('admin.requestLog.metadataTitle') };
}
export default async function RequestLogDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = await getRequestLogDetail({ actor: await getCurrentActor() }, id).catch(() => null);
  if (!entry) notFound();
  return (
    <Layout admin>
      <div className="px-lg py-md">
        <RequestLogDetail entry={entry} />
      </div>
    </Layout>
  );
}
