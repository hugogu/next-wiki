import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaticSitePageShell } from '@/components/admin/static-site/StaticSitePageShell';
import { StaticSiteOverview } from '@/components/admin/static-site/StaticSiteOverview';
import { getCurrentActor } from '@/server/services/auth';
import { getTarget } from '@/server/services/static-site';
import { DomainError } from '@/server/errors';
import { getLocale, getDictionary } from '@/i18n/server';
import { can } from '@/server/permissions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.staticSite.metadataTitle') };
}

export default async function AdminStaticSitePage() {
  const actor = await getCurrentActor();
  if (actor.kind !== 'user') notFound();
  const canManage = can({ actor }, 'manage_static_site', { kind: 'static_site' });

  // Hidden denial: a non-admin sees a 404 rather than a forbidden page, so the
  // surface does not advertise its own existence.
  let target;
  try {
    target = await getTarget({ actor });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  return (
    <StaticSitePageShell canManage={canManage}>
      <StaticSiteOverview initial={target} canManage={canManage} />
    </StaticSitePageShell>
  );
}
