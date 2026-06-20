import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { StorageBackendTabs } from '@/components/admin/storage/StorageBackendTabs';
import { getCurrentActor } from '@/server/services/auth';
import * as storageConfig from '@/server/services/storage-config';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.storage.metadataTitle') };
}

export default async function AdminStoragePage() {
  const actor = await getCurrentActor();
  const overview = await storageConfig.getOverview({ actor });
  if (!overview) {
    notFound();
  }

  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.storage.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.storage.description')}</p>
        </div>

        <StorageBackendTabs backends={overview.backends} />
      </div>
    </Layout>
  );
}
