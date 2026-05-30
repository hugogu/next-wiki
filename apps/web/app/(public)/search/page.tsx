import { buildPermissionContext } from "@/server/auth/session";
import { getSession } from "@/server/auth/session";

type Props = {
  searchParams: Promise<{
    q?: string;
    tag?: string | string[];
    locale?: string;
    page?: string;
  }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const { q, tag, locale, page: pageParam } = await searchParams;
  const session = await getSession();
  const actor = await buildPermissionContext(session?.user.id ?? null);

  const tagSlugs = tag ? (Array.isArray(tag) ? tag : [tag]) : [];
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10));

  let results = null;
  if (q) {
    const { searchPages } = await import("@/server/services/search/query-service");
    results = await searchPages({
      q,
      locale,
      tagSlugs,
      page: currentPage,
      limit: 20,
      actor,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Search</h1>

      {/* Search form */}
      <form method="GET" className="mb-8 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search pages…"
          autoFocus
          className="flex-1 rounded border border-border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
        >
          Search
        </button>
      </form>

      {/* Tag filter chips */}
      {tagSlugs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {tagSlugs.map((slug) => (
            <span
              key={slug}
              className="rounded-full bg-primary-100 px-3 py-1 text-xs font-medium text-primary-700"
            >
              #{slug}
            </span>
          ))}
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          <p className="mb-4 text-sm text-text-muted">
            {results.total} result{results.total !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
          </p>
          {results.items.length === 0 ? (
            <p className="text-text-muted">No pages found. Try different keywords or tags.</p>
          ) : (
            <ul className="space-y-4">
              {results.items.map((item) => (
                <li key={item.pageId} className="rounded border border-border p-4 hover:border-primary-300">
                  <a
                    href={`/${item.spaceKey}${item.path}${item.locale !== "en" ? `?locale=${item.locale}` : ""}`}
                    className="block"
                  >
                    <h2 className="text-base font-semibold text-link hover:underline">
                      {item.title}
                    </h2>
                    <p className="mt-1 text-xs text-text-muted">
                      {item.spaceKey}{item.path}
                    </p>
                    {item.excerpt && (
                      <p
                        className="mt-2 text-sm text-text-secondary"
                        dangerouslySetInnerHTML={{ __html: item.excerpt }}
                      />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          {(currentPage > 1 || results.hasMore) && (
            <div className="mt-6 flex justify-center gap-2">
              {currentPage > 1 && (
                <a
                  href={`?q=${q}&page=${currentPage - 1}${tagSlugs.map((t) => `&tag=${t}`).join("")}`}
                  className="rounded border border-border px-3 py-1 text-sm hover:bg-surface"
                >
                  Previous
                </a>
              )}
              {results.hasMore && (
                <a
                  href={`?q=${q}&page=${currentPage + 1}${tagSlugs.map((t) => `&tag=${t}`).join("")}`}
                  className="rounded border border-border px-3 py-1 text-sm hover:bg-surface"
                >
                  Next
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export async function generateMetadata({ searchParams }: Props) {
  const { q } = await searchParams;
  return {
    title: q ? `Search: ${q} — next-wiki` : "Search — next-wiki",
  };
}
