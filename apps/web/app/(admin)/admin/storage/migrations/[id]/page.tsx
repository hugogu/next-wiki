import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { BackLink } from '@/components/ui/BackLink';
import { MigrationStatus } from '@/components/admin/storage/MigrationStatus';
import { getCurrentActor } from '@/server/services/auth';
import * as migrationService from '@/server/services/migration';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.storage.migration.metadataTitle') };
}

export default async function MigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await getCurrentActor();
  const migration = await migrationService.getMigration({ actor }, id).catch(() => null);
  if (!migration) {
    notFound();
  }

  const locale = await getLocale();
  const t = getDictionary(locale);

  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <BackLink fallbackHref="/admin/storage">{t('admin.storage.migration.backToStorage')}</BackLink>
        <h1 className="font-display text-xl font-semibold">{t('admin.storage.migration.metadataTitle')}</h1>
        <MigrationStatus initial={migration} />
      </div>
    </Layout>
  );
}
