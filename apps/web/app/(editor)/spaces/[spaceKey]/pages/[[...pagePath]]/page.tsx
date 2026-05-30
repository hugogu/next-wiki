import { notFound, redirect } from "next/navigation";
import { requireSession, buildPermissionContext } from "@/server/auth/session";

type Props = {
  params: Promise<{ spaceKey: string; pagePath?: string[] }>;
  searchParams: Promise<{ locale?: string; new?: string }>;
};

export default async function EditorRoute({ params, searchParams }: Props) {
  const session = await requireSession();
  const actor = await buildPermissionContext(session.user.id);

  const { spaceKey, pagePath = [] } = await params;
  const { locale = "en", new: isNew } = await searchParams;
  const path = "/" + pagePath.join("/") || "/";

  let existingPage = null;
  if (!isNew) {
    try {
      const { getPage } = await import("@/server/services/wiki/page-service");
      existingPage = await getPage(spaceKey, path, locale, actor);
    } catch {
      // New page flow
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm text-text-muted">
          {spaceKey}{path} ({locale})
        </span>
        <div className="flex gap-2 text-sm">
          {existingPage && (
            <a href={`/${spaceKey}${path}`} className="text-link hover:underline">
              View published
            </a>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor panel — PageEditor component implemented in packages/editor */}
        <main className="flex-1 overflow-auto p-4">
          <div className="rounded border border-border bg-surface p-8 text-center text-text-muted">
            <p className="mb-2 font-medium">Markdown Editor</p>
            <p className="text-sm">
              Tiptap-based Markdown editor — implemented in packages/editor (Phase 3 continuation)
            </p>
            {existingPage && (
              <pre className="mt-4 rounded bg-white p-4 text-left text-xs">
                {existingPage.title}
              </pre>
            )}
          </div>
        </main>

        {/* Revision history sidebar */}
        <aside className="w-64 overflow-auto border-l border-border p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Revision History</h2>
          {existingPage ? (
            <RevisionHistoryPanel pageId={existingPage.id} actor={actor} />
          ) : (
            <p className="text-xs text-text-muted">No revisions yet</p>
          )}
        </aside>
      </div>
    </div>
  );
}

async function RevisionHistoryPanel({ pageId, actor }: { pageId: string; actor: any }) {
  const { listPageRevisions } = await import("@/server/services/wiki/page-service");
  const revisions = await listPageRevisions(pageId, actor);

  return (
    <ul className="space-y-2">
      {revisions.slice(0, 20).map((rev: any) => (
        <li key={rev.id} className="rounded border border-border p-2 text-xs">
          <div className="font-medium">Rev {rev.revisionNumber}</div>
          <div className="text-text-muted">{new Date(rev.createdAt).toLocaleDateString()}</div>
          {rev.changeSummary && (
            <div className="mt-1 truncate text-text-muted">{rev.changeSummary}</div>
          )}
        </li>
      ))}
    </ul>
  );
}
