"use client";

type DiffLine = {
  type: "added" | "removed" | "unchanged";
  content: string;
};

type Props = {
  diffLines: DiffLine[];
  revisionA: number;
  revisionB: number;
};

const lineStyles: Record<DiffLine["type"], string> = {
  added: "bg-success-50 text-success-800 before:content-['+'] before:mr-2",
  removed: "bg-danger-50 text-danger-800 before:content-['-'] before:mr-2",
  unchanged: "text-text-secondary",
};

export function RevisionDiffView({ diffLines, revisionA, revisionB }: Props) {
  const added = diffLines.filter((l) => l.type === "added").length;
  const removed = diffLines.filter((l) => l.type === "removed").length;

  return (
    <div className="font-mono text-xs">
      <div className="mb-2 flex gap-4 text-sm font-sans">
        <span className="text-text-muted">
          Rev {revisionA} → Rev {revisionB}
        </span>
        <span className="text-success-700">+{added} added</span>
        <span className="text-danger-700">−{removed} removed</span>
      </div>
      <div className="rounded border border-border overflow-auto max-h-[60vh]">
        {diffLines.map((line, i) => (
          <div
            key={i}
            className={`px-3 py-0.5 ${lineStyles[line.type]} whitespace-pre-wrap break-all`}
          >
            {line.content || " "}
          </div>
        ))}
      </div>
    </div>
  );
}
