import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ReplicaSyncStatus } from '@/components/admin/storage/ReplicaSyncStatus';
import { getCurrentActor } from '@/server/services/auth';
import * as storageConfig from '@/server/services/storage-config';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.storage.sync.metadataTitle') };
}

export default async function ReplicaSyncPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getCurrentActor();
  const sync = await storageConfig.getReplicaSyncStatus({ actor }, id).catch(() => null);
  if (!sync) notFound();

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <h1 className="font-display text-xl font-semibold">
          {t('admin.storage.sync.metadataTitle')}
        </h1>
        <ReplicaSyncStatus initial={sync} />
      </div>
    </Layout>
  );
}
