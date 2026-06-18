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
        <CreatePageForm />
      </div>
    </Layout>
  );
}
