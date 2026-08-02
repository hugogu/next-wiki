import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaticSitePageShell } from '@/components/admin/static-site/StaticSitePageShell';
import { PublishHistory } from '@/components/admin/static-site/PublishHistory';
import { getCurrentActor } from '@/server/services/auth';
import { can } from '@/server/permissions';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.staticSite.metadataTitle') };
}

export default async function AdminStaticSiteHistoryPage() {
  const actor = await getCurrentActor();

  // Hidden denial: a non-admin sees a 404 rather than a forbidden page, so the
  // surface does not advertise its own existence.
  if (actor.kind !== 'user' || !can({ actor }, 'manage_static_site', { kind: 'static_site' })) {
    notFound();
  }

  return (
    <StaticSitePageShell>
      <PublishHistory />
    </StaticSitePageShell>
  );
}
