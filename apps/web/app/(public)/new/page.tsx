import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { CreatePageForm } from '@/components/pages/CreatePageForm';
import { getCurrentActor } from '@/server/services/auth';
import * as pageService from '@/server/services/pages';

export const metadata: Metadata = {
  title: 'New page',
};

export const dynamic = 'force-dynamic';

export default async function NewPage() {
  const actor = await getCurrentActor();

  const allowed = await pageService.canCreate({ actor });
  if (!allowed) {
    notFound();
  }

  return (
    <Layout>
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'New page' }]} />
      <h1 className="text-2xl font-semibold mb-md">Create a new page</h1>
      <CreatePageForm />
    </Layout>
  );
}
