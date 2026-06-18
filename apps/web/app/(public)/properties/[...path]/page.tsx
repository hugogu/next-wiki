import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { PagePropertiesForm } from '@/components/pages/PagePropertiesForm';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams, getPageHref } from '@/lib/path';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: `Properties: ${path}` };
}

export default async function PageProperties({ params }: { params: Params }) {
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
          <Link href={getPageHref(path)} className="text-sm text-primary hover:underline">
            ← Back to page
          </Link>
        </div>
        <h1 className="font-display text-3xl font-semibold mb-md">Page properties</h1>
        <p className="text-muted mb-lg">
          Configure the URL path and other settings for this page.
        </p>
        <PagePropertiesForm path={path} />
      </div>
    </Layout>
  );
}
