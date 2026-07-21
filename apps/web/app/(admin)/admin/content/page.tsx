import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { getDictionary, getLocale } from '@/i18n/server';
import { getCurrentActor } from '@/server/services/auth';
import { listDataSources } from '@/server/services/content-data-sources';
import { ContentDataSourcesPanel } from '@/components/admin/ContentDataSourcesPanel';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: getDictionary(locale)('admin.content.metadataTitle') };
}

export default async function AdminContentPage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user' || actor.role !== 'admin') notFound();

  const items = await listDataSources({ actor });

  return (
    <Layout admin>
      <div className="space-y-md px-lg py-md">
        <ContentDataSourcesPanel initial={items} />
      </div>
    </Layout>
  );
}
