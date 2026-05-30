"use client";

import { useState, useTransition } from "react";

interface AiDraftSheetProps {
  pageId: string;
  spaceKey: string;
  pagePath: string;
  onApply: (draft: string) => void;
}

export function AiDraftSheet({ pageId, spaceKey, pagePath, onApply }: AiDraftSheetProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setError(null);
    setDraft("");

    startTransition(async () => {
      try {
        const resp = await fetch("/api/ai/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contextType: "page",
            contextId: pageId,
            userMessage: `Write a draft for the page "${pagePath}" based on: ${prompt}`,
            mode: "draft",
          }),
        });

        if (!resp.ok || !resp.body) {
          setError(`HTTP ${resp.status}`);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop()!;

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const chunk = JSON.parse(raw) as { type: string; content?: string };
              if (chunk.type === "text" && chunk.content) {
                accumulated += chunk.content;
                setDraft(accumulated);
              }
            } catch {
              // skip malformed
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-neutral-50"
        title="Generate AI draft"
      >
        <span>✦</span>
        <span>AI Draft</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex w-[640px] max-w-full flex-col rounded-lg border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">AI Draft Generator</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-text-muted hover:text-text-secondary"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-text-secondary">
                  What should this page be about?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe the content you want to generate…"
                  className="w-full resize-none rounded border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={pending || !prompt.trim()}
                className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {pending ? "Generating…" : "Generate"}
              </button>

              {error && (
                <p className="text-xs text-danger-600">{error}</p>
              )}

              {draft && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">
                    Generated Draft
                  </label>
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-neutral-50 p-3 text-xs text-text-primary">
                    {draft}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => { onApply(draft); setOpen(false); }}
                      className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      Apply to Editor
                    </button>
                    <button
                      onClick={() => setDraft("")}
                      className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-neutral-50"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
