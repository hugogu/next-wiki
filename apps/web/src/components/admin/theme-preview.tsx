"use client";

import type { ThemeTokens } from "@next-wiki/shared";

interface ThemePreviewProps {
  tokens: Partial<ThemeTokens> & {
    colors?: Partial<ThemeTokens["colors"]>;
    typography?: Partial<ThemeTokens["typography"]>;
  };
}

function pick(
  tokens: ThemePreviewProps["tokens"],
  key: keyof ThemeTokens["colors"],
  fallback: string,
): string {
  return (tokens.colors?.[key] as string | undefined) ?? fallback;
}

/**
 * Visual miniature of a theme's key token values.
 * Rendered inline using style props — no CSS vars, safe to use anywhere.
 */
export function ThemePreview({ tokens }: ThemePreviewProps) {
  const bg = pick(tokens, "background", "#ffffff");
  const surface = pick(tokens, "surface", "#f8fafc");
  const border = pick(tokens, "border", "#e2e8f0");
  const textPrimary = (tokens.colors?.text as { primary?: string } | undefined)?.primary ?? "#0f172a";
  const textMuted = (tokens.colors?.text as { muted?: string } | undefined)?.muted ?? "#64748b";
  const primary500 =
    (tokens.colors?.primary as Record<string, string> | undefined)?.[500] ??
    (tokens.colors?.primary as Record<string, string> | undefined)?.["500"] ??
    "#3b82f6";
  const link = (tokens.colors?.link as { default?: string } | undefined)?.default ?? "#2563eb";
  const fontBody =
    tokens.typography?.fontFamily?.body ??
    "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

  return (
    <div
      className="overflow-hidden rounded-md border"
      style={{ borderColor: border, fontFamily: fontBody, fontSize: "12px" }}
    >
      {/* Nav bar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: surface, borderBottom: `1px solid ${border}` }}
      >
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: primary500 }}
        />
        <span style={{ color: textPrimary, fontWeight: 600 }}>Wiki</span>
        <div className="flex-1" />
        <span style={{ color: link }}>Search</span>
      </div>

      {/* Content */}
      <div className="flex" style={{ background: bg }}>
        {/* Sidebar */}
        <div
          className="w-16 shrink-0 px-2 py-3"
          style={{ background: surface, borderRight: `1px solid ${border}` }}
        >
          <div className="mb-1 rounded px-1 py-0.5" style={{ background: primary500 }}>
            <span className="text-white" style={{ fontSize: "10px" }}>
              Home
            </span>
          </div>
          <div className="px-1 py-0.5" style={{ color: textMuted, fontSize: "10px" }}>
            Docs
          </div>
          <div className="px-1 py-0.5" style={{ color: textMuted, fontSize: "10px" }}>
            API
          </div>
        </div>

        {/* Page body */}
        <div className="flex-1 p-3">
          <div
            className="mb-1 h-2.5 w-24 rounded"
            style={{ background: textPrimary, opacity: 0.8 }}
          />
          <div className="mb-0.5 h-1.5 w-full rounded" style={{ background: border }} />
          <div className="mb-0.5 h-1.5 w-4/5 rounded" style={{ background: border }} />
          <div className="mb-0.5 h-1.5 w-3/5 rounded" style={{ background: border }} />
          <div
            className="mt-2 h-1.5 w-20 rounded"
            style={{ background: link, opacity: 0.7 }}
          />
        </div>
      </div>
    </div>
  );
}
