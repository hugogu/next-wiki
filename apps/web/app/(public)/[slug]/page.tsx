import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx } from '@/server/permissions';
import { seedDatabase } from '@/server/seed';
import { runMigrations } from '@/server/db/migrate';

export const dynamic = 'force-dynamic';

type PageParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug } = await params;
  return { title: slug };
}

async function getData(slug: string) {
  await runMigrations();
  await seedDatabase();
  return pageService.getLive(buildAnonymousCtx(), slug);
}

export default async function PageRead({ params }: { params: PageParams }) {
  const { slug } = await params;
  const page = await getData(slug);

  if (!page) {
    notFound();
  }

  return (
    <Layout>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: page.title },
        ]}
      />
      <article className="bg-surface border border-border rounded-lg p-lg shadow-sm">
        <header className="mb-lg border-b border-border pb-md">
          <h1 className="text-3xl font-semibold">{page.title}</h1>
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
