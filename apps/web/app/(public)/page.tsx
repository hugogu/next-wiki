import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { PageList } from '@/components/ui/PageList';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx } from '@/server/permissions';
import { seedDatabase } from '@/server/seed';
import { runMigrations } from '@/server/db/migrate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'next-wiki',
};

async function getData() {
  await runMigrations();
  await seedDatabase();
  return pageService.listPublished(buildAnonymousCtx());
}

export default async function HomePage() {
  const pages = await getData();

  return (
    <Layout>
      <Breadcrumbs items={[{ label: 'Home' }]} />
      <div className="mb-md">
        <h1 className="text-2xl font-semibold">Wiki Pages</h1>
        <p className="text-muted">Browse published pages.</p>
      </div>
      {pages.length === 0 ? (
        <EmptyState title="No published pages yet">
          <p>Pages will appear here once an editor publishes them.</p>
        </EmptyState>
      ) : (
        <PageList pages={pages} />
      )}
    </Layout>
  );
}
