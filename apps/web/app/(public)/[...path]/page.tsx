import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { ContentRenderer } from '@/components/renderer/ContentRenderer';
import * as pageService from '@/server/services/pages';
import { getCurrentActor } from '@/server/services/auth';
import { getPagePathFromParams } from '@/lib/path';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ path: string[] }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  return { title: path };
}

export default async function PageRead({ params }: { params: PageParams }) {
  const raw = await params;
  const path = getPagePathFromParams(raw);
  const actor = await getCurrentActor();
  const page = await pageService.getLive({ actor }, path);

  if (!page) {
    notFound();
  }

  const canEdit = await pageService.canCreate({ actor });
  const isAuthor = actor.kind === 'user' ? page.authorId === actor.userId : false;
  const canPublish = page.status === 'draft' && (canEdit || isAuthor || (actor.kind === 'user' && actor.role === 'admin'));

  const pageContext = {
    path,
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
        <article className="flex-1 px-lg py-md max-w-none">
          <ContentRenderer html={page.contentHtml} />
          <footer className="mt-2xl pt-md border-t border-border text-sm text-muted">
            Created {new Date(page.createdAt).toLocaleString()}
            {page.authorDisplayName && ` by ${page.authorDisplayName}`}
          </footer>
        </article>
      </div>
    </Layout>
  );
}
