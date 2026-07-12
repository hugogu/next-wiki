import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { EditPageForm } from '@/components/pages/EditPageForm';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams } from '@/lib/path';
import { getLocale, getDictionary } from '@/i18n/server';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: t('page.edit.metadataTitle', { path }) };
}

export default async function EditPage({ params }: { params: Params }) {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const view = await pageService.getForEdit({ actor }, path);

  if (!view) {
    notFound();
  }

  const pageContext = {
    pageId: view.pageId,
    revisionId: view.revisionId,
    path,
    title: view.title,
    status: view.status,
    canEdit: true,
    canPublish: view.canPublish,
    version: view.latestVersion,
  };

  return (
    <Layout pageContext={pageContext} fitViewport>
      <div className="h-full flex flex-col">
        <EditPageForm path={path} initial={{ pageId: view.pageId, revisionId: view.revisionId, title: view.title, contentSource: view.contentSource, canPublish: view.canPublish, latestVersion: view.latestVersion }} />
      </div>
    </Layout>
  );
}
