import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { BackLink } from '@/components/ui/BackLink';
import { PagePropertiesForm } from '@/components/pages/PagePropertiesForm';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams, getPageHref } from '@/lib/path';
import { getStaticLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: t('page.properties.metadataTitle', { path }) };
}

export default async function PageProperties({ params }: { params: Params }) {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const page = await pageService.getLive({ actor }, path);

  if (!page) {
    notFound();
  }

  const canEdit = await pageService.canCreate({ actor });
  if (!canEdit) {
    notFound();
  }

  const pageContext = {
    pageId: page.pageId,
    path,
    title: page.title,
    status: page.status,
    canEdit: true,
    canPublish: false,
    version: page.version,
  };

  return (
    <Layout pageContext={pageContext}>
      <div className="max-w-2xl mx-auto px-lg py-xl">
        <div className="mb-md">
          <BackLink fallbackHref={getPageHref(path)}>{t('common.actions.back')}</BackLink>
        </div>
        <h1 className="font-display text-3xl font-semibold mb-md">{t('page.properties.heading')}</h1>
        <p className="text-muted mb-lg">
          {t('page.properties.description')}
        </p>
        <PagePropertiesForm pageId={page.pageId} path={path} />
      </div>
    </Layout>
  );
}
