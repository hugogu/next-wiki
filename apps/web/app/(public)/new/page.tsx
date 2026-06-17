import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
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
      <div className="h-full flex flex-col">
        <div className="shrink-0 px-lg pt-xl pb-md">
          <h1 className="font-display text-3xl font-semibold">Create a new page</h1>
        </div>
        <CreatePageForm />
      </div>
    </Layout>
  );
}
