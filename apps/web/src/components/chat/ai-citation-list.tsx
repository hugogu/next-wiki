"use client";

interface Citation {
  id: string;
  pageRevisionId: string;
  excerptLocator: string | null;
  orderIndex: number;
  pageSlug?: string;
  pageTitle?: string;
}

export function AiCitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-2 space-y-1 border-t border-border pt-2">
      <p className="text-xs font-medium text-text-muted">Sources</p>
      {citations
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c, i) => (
          <a
            key={c.id}
            href={c.pageSlug ? `/${c.pageSlug}` : "#"}
            className="flex items-center gap-1.5 text-xs text-link hover:underline"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded bg-primary-100 text-primary-700 font-medium">
              {i + 1}
            </span>
            <span>{c.pageTitle ?? c.pageRevisionId}</span>
          </a>
        ))}
    </div>
  );
}
