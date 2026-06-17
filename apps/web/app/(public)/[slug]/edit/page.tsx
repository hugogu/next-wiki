import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { EditPageForm } from '@/components/pages/EditPageForm';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Edit ${slug}` };
}

export default async function EditPage({ params }: { params: Params }) {
  const { slug } = await params;
  const actor = await getCurrentActor();
  const view = await pageService.getForEdit({ actor }, slug);

  if (!view) {
    notFound();
  }

  const pageContext = {
    slug,
    title: view.title,
    status: view.status,
    canEdit: true,
    canPublish: view.canPublish,
    version: view.latestVersion,
  };

  return (
    <Layout pageContext={pageContext}>
      <div className="h-full flex flex-col">
        <EditPageForm slug={slug} initial={{ title: view.title, contentSource: view.contentSource, canPublish: view.canPublish, latestVersion: view.latestVersion }} />
      </div>
    </Layout>
  );
}
