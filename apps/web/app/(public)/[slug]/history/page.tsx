import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';

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

  if (revisions.length === 0) {
    notFound();
  }

  return (
    <Layout>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: slug, href: `/${slug}` },
          { label: 'History' },
        ]}
      />
      <h1 className="text-2xl font-semibold mb-md">Version history</h1>
      {revisions.length === 0 ? (
        <EmptyState title="No revisions found">
          <p>This page does not have any saved revisions.</p>
        </EmptyState>
      ) : (
        <ul className="space-y-sm">
          {revisions.map((r) => (
            <li key={r.version} className="flex items-center justify-between p-md bg-surface border border-border rounded-md">
              <div>
                <Link href={`/${slug}/revisions/${r.version}`} className="font-medium text-primary hover:underline">
                  Version {r.version}
                </Link>
                <span className="ml-sm text-sm text-muted capitalize">{r.status}</span>
                <p className="text-sm text-muted">
                  {new Date(r.createdAt).toLocaleString()} by {r.authorDisplayName ?? 'Unknown'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
