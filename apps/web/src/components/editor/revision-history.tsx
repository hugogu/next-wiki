"use client";

type Revision = {
  id: string;
  revisionNumber: number;
  title: string;
  changeSummary?: string | null;
  authoredByUserId?: string | null;
  createdAt: string;
};

type Props = {
  revisions: Revision[];
  currentRevisionId?: string;
  onRestore?: (revisionId: string) => void;
  onDiff?: (revisionIdA: string, revisionIdB: string) => void;
};

export function RevisionHistory({ revisions, currentRevisionId, onRestore, onDiff }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary">Revision History</h3>
      <ul className="space-y-1">
        {revisions.map((rev) => (
          <li
            key={rev.id}
            className={`rounded border p-2 text-xs ${
              rev.id === currentRevisionId
                ? "border-primary-300 bg-primary-50"
                : "border-border bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">Rev {rev.revisionNumber}</span>
              <div className="flex gap-1">
                {onDiff && rev.id !== currentRevisionId && (
                  <button
                    onClick={() => onDiff(rev.id, currentRevisionId ?? rev.id)}
                    className="rounded px-1 text-link hover:underline"
                  >
                    Diff
                  </button>
                )}
                {onRestore && rev.id !== currentRevisionId && (
                  <button
                    onClick={() => onRestore(rev.id)}
                    className="rounded px-1 text-text-muted hover:text-text-primary"
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
            {rev.changeSummary && (
              <p className="mt-0.5 truncate text-text-muted">{rev.changeSummary}</p>
            )}
            <time className="text-text-muted">{new Date(rev.createdAt).toLocaleString()}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}
