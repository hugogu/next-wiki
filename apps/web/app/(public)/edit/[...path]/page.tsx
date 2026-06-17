import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { EditPageForm } from '@/components/pages/EditPageForm';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams } from '@/lib/path';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: `Edit ${path}` };
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
    path,
    title: view.title,
    status: view.status,
    canEdit: true,
    canPublish: view.canPublish,
    version: view.latestVersion,
  };

  return (
    <Layout pageContext={pageContext}>
      <div className="h-full flex flex-col">
        <EditPageForm path={path} initial={{ title: view.title, contentSource: view.contentSource, canPublish: view.canPublish, latestVersion: view.latestVersion }} />
      </div>
    </Layout>
  );
}
