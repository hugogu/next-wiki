import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { AdminAuditTable } from '@/components/admin/AdminAuditTable';
import { getCurrentActor } from '@/server/services/auth';
import * as auditService from '@/server/services/audit';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.apiAudit.metadataTitle') };
}

export default async function AdminApiAuditPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);

  const actor = await getCurrentActor();
  const initialData = await auditService.listAllSafe({ actor });
  if (!initialData) {
    notFound();
  }

  return (
    <Layout admin>
      <div className="max-w-6xl mx-auto px-lg py-xl">
        <div className="mb-lg">
          <h1 className="font-display text-3xl font-semibold">{t('admin.apiAudit.title')}</h1>
        </div>
        <AdminAuditTable initialData={initialData} />
      </div>
    </Layout>
  );
}
