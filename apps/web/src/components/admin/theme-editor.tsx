"use client";

import { useState } from "react";
import type { ThemeTokens } from "@next-wiki/shared";
import { defaultThemeTokens } from "@next-wiki/shared";
import { checkThemeAccessibility } from "@/server/services/themes/accessibility";
import { ThemePreview } from "./theme-preview";

interface ThemeEditorProps {
  themeId: string;
  initialName: string;
  initialTokenSet: Record<string, unknown>;
  /** Server action that accepts FormData with fields: id, name, key?, tokenSet (JSON string). */
  formAction: (formData: FormData) => void | Promise<void>;
  /** Show a key field for new theme creation. */
  showKeyField?: boolean;
}

type SemanticColors = {
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  linkDefault: string;
  primary500: string;
};

function extractColors(tokenSet: Record<string, unknown>): SemanticColors {
  const d = defaultThemeTokens;
  const c = (tokenSet.colors as Record<string, unknown> | undefined) ?? {};
  const text = (c.text as Record<string, string> | undefined) ?? {};
  const link = (c.link as Record<string, string> | undefined) ?? {};
  const primary = (c.primary as Record<string, string> | undefined) ?? {};
  return {
    background: (c.background as string) ?? d.colors.background,
    surface: (c.surface as string) ?? d.colors.surface,
    border: (c.border as string) ?? d.colors.border,
    textPrimary: text.primary ?? d.colors.text.primary,
    textSecondary: text.secondary ?? d.colors.text.secondary,
    textMuted: text.muted ?? d.colors.text.muted,
    linkDefault: link.default ?? d.colors.link.default,
    primary500: primary["500"] ?? d.colors.primary[500],
  };
}

function buildTokenSet(base: Record<string, unknown>, c: SemanticColors): Record<string, unknown> {
  const d = defaultThemeTokens;
  return {
    ...base,
    colors: {
      ...((base.colors as Record<string, unknown>) ?? {}),
      background: c.background,
      surface: c.surface,
      border: c.border,
      text: { primary: c.textPrimary, secondary: c.textSecondary, muted: c.textMuted, inverse: d.colors.text.inverse },
      link: { default: c.linkDefault, hover: c.linkDefault, visited: d.colors.link.visited },
      primary: { ...d.colors.primary, 500: c.primary500, 600: c.primary500 },
    },
  };
}

const FIELDS: Array<{ key: keyof SemanticColors; label: string }> = [
  { key: "background", label: "Background" },
  { key: "surface", label: "Surface" },
  { key: "border", label: "Border" },
  { key: "textPrimary", label: "Text — Primary" },
  { key: "textSecondary", label: "Text — Secondary" },
  { key: "textMuted", label: "Text — Muted" },
  { key: "linkDefault", label: "Link color" },
  { key: "primary500", label: "Accent (primary)" },
];

export function ThemeEditor({ themeId, initialName, initialTokenSet, formAction, showKeyField }: ThemeEditorProps) {
  const [name, setName] = useState(initialName);
  const [key, setKey] = useState("");
  const [colors, setColors] = useState<SemanticColors>(() => extractColors(initialTokenSet));

  const builtTokenSet = buildTokenSet(initialTokenSet, colors);
  const warnings = checkThemeAccessibility(builtTokenSet);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={themeId} />
      <input type="hidden" name="tokenSet" value={JSON.stringify(builtTokenSet)} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: controls */}
        <div className="space-y-5">
          {/* Key (new theme only) */}
          {showKeyField && (
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">Theme key</label>
              <input
                type="text"
                name="key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. my-theme"
                pattern="[a-z0-9-]+"
                required
                className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-text-primary focus:border-primary-400 focus:outline-none"
              />
              <p className="mt-0.5 text-xs text-text-muted">Lowercase letters, numbers, hyphens only.</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Theme name</label>
            <input
              type="text"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm text-text-primary focus:border-primary-400 focus:outline-none"
            />
          </div>

          {/* Color pickers */}
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">Colors</p>
            <div className="space-y-2">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="h-8 w-10 cursor-pointer rounded border border-border"
                    aria-label={label}
                  />
                  <span className="flex-1 text-sm text-text-secondary">{label}</span>
                  <code className="font-mono text-xs text-text-muted">{colors[key]}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Contrast warnings */}
          {warnings.length > 0 && (
            <div className="rounded border border-warning-200 bg-warning-50 p-3">
              <p className="mb-1 text-sm font-medium text-warning-800">Contrast warnings</p>
              {warnings.map((w) => (
                <p key={w.pair} className="text-xs text-warning-700">
                  {w.pair}: {w.ratio}:1 (WCAG AA requires ≥3:1 for large text)
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Save theme
            </button>
            <a
              href="/admin/themes"
              className="rounded border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface"
            >
              Cancel
            </a>
          </div>
        </div>

        {/* Right: preview */}
        <div>
          <p className="mb-2 text-sm font-medium text-text-primary">Preview</p>
          <ThemePreview tokens={builtTokenSet as Partial<ThemeTokens>} />
        </div>
      </div>
    </form>
  );
}
