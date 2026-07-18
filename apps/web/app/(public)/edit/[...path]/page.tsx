import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { EditPageForm } from '@/components/pages/EditPageForm';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams } from '@/lib/path';
import { getStaticLocale, getDictionary } from '@/i18n/server';
import type { ReaderSpace } from '@/lib/path';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const locale = await getStaticLocale();
  const t = getDictionary(locale);
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: t('page.edit.metadataTitle', { path }) };
}

export default async function EditPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ space?: string }>;
}) {
  const raw = await params;
  const query = await searchParams;
  const space: ReaderSpace | null = query.space === undefined || query.space === 'wiki'
    ? 'wiki'
    : query.space === 'raw' || query.space === 'generated'
      ? query.space
      : null;
  if (!space) notFound();
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const view = await pageService.getForEdit({ actor }, path, space);

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
    space,
  };

  return (
    <Layout pageContext={pageContext} fitViewport space={space}>
      <div className="h-full flex flex-col">
        <EditPageForm path={path} space={space} initial={{ pageId: view.pageId, revisionId: view.revisionId, title: view.title, contentSource: view.contentSource, canPublish: view.canPublish, canDelete: view.canDelete, latestVersion: view.latestVersion, metadata: view.metadata }} />
      </div>
    </Layout>
  );
}
