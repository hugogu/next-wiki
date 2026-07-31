import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { StaticSitePanel } from '@/components/admin/static-site/StaticSitePanel';
import { getCurrentActor } from '@/server/services/auth';
import { getTarget } from '@/server/services/static-site';
import { DomainError } from '@/server/errors';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return { title: t('admin.staticSite.metadataTitle') };
}

export default async function AdminStaticSitePage() {
  const actor = await getCurrentActor();

  // Hidden denial: a non-admin sees a 404 rather than a forbidden page, so the
  // surface does not advertise its own existence.
  let target;
  try {
    target = await getTarget({ actor });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <Layout admin>
      <div className="px-lg py-md space-y-md">
        <div>
          <h1 className="font-display text-xl font-semibold">{t('admin.staticSite.title')}</h1>
          <p className="mt-xs text-sm text-muted">{t('admin.staticSite.description')}</p>
        </div>
        <StaticSitePanel initial={target} />
      </div>
    </Layout>
  );
}
