import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { PublishButton } from '@/components/pages/PublishButton';
import { getPagePathFromParams, getRevisionHref } from '@/lib/path';

export const dynamic = 'force-dynamic';

type Params = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: `History: ${path}` };
}

export default async function HistoryPage({ params }: { params: Params }) {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const revisions = await pageService.getHistory({ actor }, path);
  const page = await pageService.getLive({ actor }, path);

  if (revisions.length === 0 && !page) {
    notFound();
  }

  const pageContext = page
    ? {
        path,
        title: page.title,
        status: page.status,
        canEdit: await pageService.canCreate({ actor }),
        canPublish: false,
        version: page.version,
      }
    : undefined;

  return (
    <Layout pageContext={pageContext}>
      <div className="max-w-3xl mx-auto px-lg py-xl">
        <h1 className="font-display text-3xl font-semibold mb-md">Version history: {page?.title ?? path}</h1>
        {revisions.length === 0 ? (
          <EmptyState title="No revisions visible">
            <p>You do not have permission to view this page&#39;s history.</p>
          </EmptyState>
        ) : (
          <ul className="space-y-sm">
            {revisions.map((r) => (
              <li key={r.version} className="flex items-center justify-between p-md bg-surface border border-border rounded-lg">
                <div>
                  <Link href={getRevisionHref(path, r.version)} className="font-medium text-primary hover:underline">
                    Version {r.version}
                  </Link>
                  <span className="ml-sm text-sm text-muted capitalize">{r.status}</span>
                  <p className="text-sm text-muted">
                    {new Date(r.createdAt).toLocaleString()} by {r.authorDisplayName ?? 'Unknown'}
                  </p>
                </div>
                {r.status === 'draft' && r.canPublish ? (
                  <PublishButton path={path} version={r.version} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
