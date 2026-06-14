import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string; n: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, n } = await params;
  return { title: `Revision ${n} - ${slug}` };
}

export default async function RevisionPage({ params }: { params: Params }) {
  const { slug, n } = await params;
  const version = parseInt(n, 10);
  if (Number.isNaN(version) || version < 1) {
    notFound();
  }

  const actor = await getCurrentActor();
  const revision = await pageService.getRevision({ actor }, slug, version);

  if (!revision) {
    notFound();
  }

  return (
    <Layout>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: slug, href: `/${slug}` },
          { label: 'History', href: `/${slug}/history` },
          { label: `Revision ${version}` },
        ]}
      />
      <article className="bg-surface border border-border rounded-lg p-lg shadow-sm">
        <header className="mb-lg border-b border-border pb-md">
          <h1 className="text-3xl font-semibold">Revision {version}</h1>
          <p className="text-sm text-muted mt-sm">
            {revision.status === 'published' ? 'Published' : 'Draft'} on{' '}
            {new Date(revision.createdAt).toLocaleString()}
            {revision.authorDisplayName && ` by ${revision.authorDisplayName}`}
          </p>
        </header>
        <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: revision.contentHtml }} />
      </article>
    </Layout>
  );
}
