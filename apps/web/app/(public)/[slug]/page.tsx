import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
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

  const canEdit = await pageService.canCreate({ actor });
  const isAuthor = actor.kind === 'user' ? page.authorId === actor.userId : false;
  const canPublish = page.status === 'draft' && (canEdit || isAuthor || (actor.kind === 'user' && actor.role === 'admin'));

  const pageContext = {
    slug,
    title: page.title,
    status: page.status,
    canEdit,
    canPublish,
    version: page.version,
  };

  return (
    <Layout pageContext={pageContext}>
      <div className="min-h-full flex flex-col">
        {page.status === 'draft' && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 px-lg py-sm text-sm">
            This page is a draft and not yet published.
          </div>
        )}
        <article className="flex-1 px-lg py-xl max-w-none">
          <header className="mb-xl">
            <h1 className="font-display text-4xl font-semibold text-foreground mb-sm">{page.title}</h1>
            {page.publishedAt && (
              <p className="text-sm text-muted">
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
      </div>
    </Layout>
  );
}
