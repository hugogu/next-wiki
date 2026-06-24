/**
 * Canonical reading-theme token registry and default values for the per-user
 * reading theme (006). These mirror the static fallbacks in `app/globals.css`.
 * When a user has no row in `user_appearance` the layout falls back to these
 * defaults; otherwise the user's per-row values override the custom
 * properties inside `.prose` via `buildUserAppearanceCss`.
 */

/** Color token keys. The CSS custom property is `--color-${key}`. */
export const COLOR_TOKEN_KEYS = [
  'primary',
  'primary-text',
  'primary-hover',
  'background',
  'surface',
  'surface-elevated',
  'border',
  'border-strong',
  'muted',
  'foreground',
  'ring',
  'danger',
  'warning',
] as const;

export type ColorTokenKey = (typeof COLOR_TOKEN_KEYS)[number];
export type ColorTokens = Record<ColorTokenKey, string>;

export const DEFAULT_LIGHT_COLORS: ColorTokens = {
  primary: '#b45309',
  'primary-text': '#ffffff',
  'primary-hover': '#92400e',
  background: '#fafaf9',
  surface: '#ffffff',
  'surface-elevated': '#f5f5f4',
  border: '#e7e5e4',
  'border-strong': '#d6d3d1',
  muted: '#78716c',
  foreground: '#292524',
  ring: 'rgba(180, 83, 9, 0.25)',
  danger: '#dc2626',
  warning: '#d97706',
};

export const DEFAULT_DARK_COLORS: ColorTokens = {
  primary: '#f59e0b',
  'primary-text': '#1c1917',
  'primary-hover': '#d97706',
  background: '#1c1917',
  surface: '#292524',
  'surface-elevated': '#44403c',
  border: '#57534e',
  'border-strong': '#78716c',
  muted: '#a8a29e',
  foreground: '#f5f5f4',
  ring: 'rgba(245, 158, 11, 0.25)',
  danger: '#f87171',
  warning: '#fbbf24',
};

/** Font slots map to the `--font-${slot}` CSS custom properties. */
export const FONT_SLOTS = ['body', 'display', 'mono'] as const;
export type FontSlot = (typeof FONT_SLOTS)[number];
export type FontSelection = Record<FontSlot, string>;

/**
 * Bundled font catalog. Only these fonts are selectable — each is either
 * self-hosted by `next/font` at build time or a system font stack, so no remote
 * web-font resource is ever loaded (FR-001b / research R6).
 */
export interface FontCatalogEntry {
  key: string;
  label: string;
  /** The CSS `font-family` stack injected for this choice. */
  stack: string;
}

export const FONT_CATALOG: FontCatalogEntry[] = [
  { key: 'source-sans-3', label: 'Source Sans 3', stack: "'Source Sans 3', system-ui, sans-serif" },
  { key: 'crimson-pro', label: 'Crimson Pro', stack: "'Crimson Pro', Georgia, serif" },
  { key: 'system-sans', label: 'System Sans', stack: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' },
  { key: 'system-serif', label: 'System Serif', stack: 'Georgia, Cambria, Times New Roman, serif' },
  {
    key: 'system-mono',
    label: 'System Mono',
    stack: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
];

export const FONT_CATALOG_KEYS = FONT_CATALOG.map((f) => f.key);

export function resolveFontStack(key: string): string | null {
  return FONT_CATALOG.find((f) => f.key === key)?.stack ?? null;
}

export const DEFAULT_FONTS: FontSelection = {
  body: 'source-sans-3',
  display: 'crimson-pro',
  mono: 'system-mono',
};

/** Font-size token keys map to the `--font-size-${key}` CSS custom properties. */
export const FONT_SIZE_KEYS = ['base', 'h1', 'h2', 'h3'] as const;
export type FontSizeKey = (typeof FONT_SIZE_KEYS)[number];
export type FontSizes = Record<FontSizeKey, string>;

export const DEFAULT_FONT_SIZES: FontSizes = {
  base: '1rem',
  h1: '2.25rem',
  h2: '1.75rem',
  h3: '1.375rem',
};
