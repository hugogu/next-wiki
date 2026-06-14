import type { PageSummary } from '@next-wiki/shared';
import Link from 'next/link';

export function PageList({ pages }: { pages: PageSummary[] }) {
  if (pages.length === 0) {
    return (
      <div className="text-center py-xl text-muted border border-dashed border-border rounded-lg">
        No published pages yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border border border-border rounded-lg bg-surface">
      {pages.map((page) => (
        <li key={page.slug}>
          <Link
            href={`/${page.slug}`}
            className="block px-md py-md hover:bg-background transition-colors"
          >
            <div className="font-medium text-foreground">{page.title}</div>
            {page.publishedAt && (
              <div className="text-sm text-muted mt-xs">
                Updated {new Date(page.updatedAt).toLocaleDateString()}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
