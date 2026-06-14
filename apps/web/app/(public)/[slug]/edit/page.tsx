import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
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

  return (
    <Layout>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: view.title, href: `/${slug}` },
          { label: 'Edit' },
        ]}
      />
      <h1 className="text-2xl font-semibold mb-md">Edit page</h1>
      <EditPageForm slug={slug} initial={{ title: view.title, contentSource: view.contentSource }} />
    </Layout>
  );
}
