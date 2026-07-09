import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AuditLogTable } from '@/components/user-center/AuditLogTable';
import { getCurrentActor } from '@/server/services/auth';
import * as auditService from '@/server/services/audit';
import * as apiKeyService from '@/server/services/api-keys';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('userCenter.audit.metadataTitle') };
}

export default async function AuditPage() {
  const actor = await getCurrentActor();
  if (actor.kind === 'anonymous') {
    redirect('/auth/login');
  }

  const ctx = { actor };
  let initialData;
  try {
    initialData = await auditService.listOwn(ctx, { page: 1, pageSize: 20 });
  } catch {
    notFound();
  }

  const keys = await apiKeyService.list(ctx);

  return (
    <div className="w-full min-w-0">
      <AuditLogTable initialData={initialData} fetchUrl="/api/audit" entryType="api" keys={keys.map((k) => ({ id: k.id, name: k.name }))} />
    </div>
  );
}
