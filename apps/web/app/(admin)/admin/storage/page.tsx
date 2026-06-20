import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { StorageBackendSummary } from '@/components/admin/storage/StorageBackendSummary';
import { StorageBackendForm } from '@/components/admin/storage/StorageBackendForm';
import { StorageBackendActions } from '@/components/admin/storage/StorageBackendActions';
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
  const local = overview.backends.find((b) => b.type === 'local');
  const s3 = overview.backends.find((b) => b.type === 's3');

  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.storage.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.storage.description')}</p>
        </div>

        <StorageBackendSummary overview={overview} />

        {overview.migration && (
          <Link
            href={`/admin/storage/migrations/${overview.migration.id}`}
            className="block rounded-lg border border-primary/40 bg-primary/5 px-md py-sm text-sm text-primary hover:underline"
          >
            {t('admin.storage.migration.bannerLink')}
          </Link>
        )}

        <div className="grid gap-md md:grid-cols-2">
          <StorageBackendForm type="local" initial={local} />
          <StorageBackendForm type="s3" initial={s3} />
        </div>

        <StorageBackendActions backends={overview.backends} />
      </div>
    </Layout>
  );
}
