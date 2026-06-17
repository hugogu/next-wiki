import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { PublishButton } from '@/components/pages/PublishButton';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `History: ${slug}` };
}

export default async function HistoryPage({ params }: { params: Params }) {
  const { slug } = await params;
  const actor = await getCurrentActor();
  const revisions = await pageService.getHistory({ actor }, slug);
  const page = await pageService.getLive({ actor }, slug);

  if (revisions.length === 0 && !page) {
    notFound();
  }

  const pageContext = page
    ? {
        slug,
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
        <h1 className="font-display text-3xl font-semibold mb-md">Version history: {page?.title ?? slug}</h1>
        {revisions.length === 0 ? (
          <EmptyState title="No revisions visible">
            <p>You do not have permission to view this page&#39;s history.</p>
          </EmptyState>
        ) : (
          <ul className="space-y-sm">
            {revisions.map((r) => (
              <li key={r.version} className="flex items-center justify-between p-md bg-surface border border-border rounded-lg">
                <div>
                  <Link href={`/${slug}/revisions/${r.version}`} className="font-medium text-primary hover:underline">
                    Version {r.version}
                  </Link>
                  <span className="ml-sm text-sm text-muted capitalize">{r.status}</span>
                  <p className="text-sm text-muted">
                    {new Date(r.createdAt).toLocaleString()} by {r.authorDisplayName ?? 'Unknown'}
                  </p>
                </div>
                {r.status === 'draft' && r.canPublish ? (
                  <PublishButton slug={slug} version={r.version} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
