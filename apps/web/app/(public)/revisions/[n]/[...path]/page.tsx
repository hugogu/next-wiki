import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams, getHistoryHref } from '@/lib/path';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[]; n: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: `Revision ${raw.n} - ${path}` };
}

export default async function RevisionPage({ params }: { params: Params }) {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const version = parseInt(raw.n, 10);
  if (Number.isNaN(version) || version < 1) {
    notFound();
  }

  const actor = await getCurrentActor();
  const revision = await pageService.getRevision({ actor }, path, version);

  if (!revision) {
    notFound();
  }

  const canEdit = await pageService.canCreate({ actor });

  return (
    <Layout pageContext={{ path, title: `Revision ${version}`, status: revision.status, canEdit, canPublish: false, version }}>
      <div className="max-w-3xl mx-auto px-lg py-xl">
        <div className="flex items-center justify-between mb-md">
          <h1 className="font-display text-3xl font-semibold">Revision {version}</h1>
          <Link
            href={getHistoryHref(path)}
            className="text-sm text-primary hover:underline"
          >
            ← Back to history
          </Link>
        </div>
        <p className="text-sm text-muted mb-xl">
          {revision.status === 'published' ? 'Published' : 'Draft'} on {new Date(revision.createdAt).toLocaleString()}
          {revision.authorDisplayName && ` by ${revision.authorDisplayName}`}
        </p>
        <article className="bg-surface border border-border rounded-lg p-lg">
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: revision.contentHtml }} />
        </article>
      </div>
    </Layout>
  );
}
