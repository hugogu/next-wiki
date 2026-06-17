import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

export default async function PageRead({ params }: { params: PageParams }) {
  const { slug } = await params;
  const actor = await getCurrentActor();
  const page = await pageService.getLive({ actor }, slug);

  if (!page) {
    notFound();
  }

  // Check whether the current user can edit — used to show action links.
  const canEdit = await pageService.canCreate({ actor });

  return (
    <Layout>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: page.title },
        ]}
      />
      {page.status === 'draft' && (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-md px-md py-sm mb-md text-sm">
          This page has not been published yet. Only editors and admins can see this draft.
        </div>
      )}
      <article className="bg-surface border border-border rounded-lg p-lg shadow-sm">
        <header className="mb-lg border-b border-border pb-md">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold">{page.title}</h1>
            <div className="flex items-center gap-sm">
              {canEdit && (
                <Link
                  href={`/${slug}/edit`}
                  className="inline-flex items-center rounded-md px-md py-sm text-sm font-medium bg-primary text-primary-text hover:bg-primary/90 transition-colors"
                >
                  Edit
                </Link>
              )}
              {actor && (
                <Link
                  href={`/${slug}/history`}
                  className="inline-flex items-center rounded-md px-md py-sm text-sm font-medium border border-border text-muted hover:text-foreground hover:bg-surface transition-colors"
                >
                  History
                </Link>
              )}
            </div>
          </div>
          {page.publishedAt && (
            <p className="text-sm text-muted mt-sm">
              Published {new Date(page.publishedAt).toLocaleDateString()}
              {page.authorDisplayName && ` by ${page.authorDisplayName}`}
            </p>
          )}
        </header>
        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: page.contentHtml }}
        />
      </article>
    </Layout>
  );
}
