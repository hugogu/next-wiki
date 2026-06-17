import type { Metadata } from 'next';
import { Layout } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/EmptyState';
import * as pageService from '@/server/services/pages';
import { buildAnonymousCtx } from '@/server/permissions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'next-wiki',
};

export default async function HomePage() {
  const pages = await pageService.listPublished(buildAnonymousCtx());

  return (
    <Layout>
      <div className="h-full flex flex-col items-center justify-center px-lg py-xl">
        <div className="max-w-2xl w-full text-center">
          <h1 className="font-display text-5xl font-semibold text-foreground mb-md">
            next-wiki
          </h1>
          <p className="text-lg text-muted mb-xl">
            A calm, focused place for team knowledge.
          </p>

          {pages.length === 0 ? (
            <EmptyState title="No published pages yet">
              <p className="text-muted">Pages will appear here once an editor publishes them.</p>
            </EmptyState>
          ) : (
            <div className="text-left">
              <h2 className="font-display text-2xl font-semibold mb-md">Published pages</h2>
              <ul className="space-y-sm">
                {pages.map((page) => (
                  <li key={page.slug}>
                    <a
                      href={`/${page.slug}`}
                      className="block p-md bg-surface border border-border rounded-lg hover:border-primary transition-colors group"
                    >
                      <span className="font-display text-xl font-medium group-hover:text-primary transition-colors">{page.title}</span>
                      <p className="text-sm text-muted mt-xs">
                        {page.publishedAt
                          ? `Published ${new Date(page.publishedAt).toLocaleDateString()}`
                          : 'Updated recently'}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
