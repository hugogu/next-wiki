/**
 * Built-in system themes (006). Seeded into `system_themes` with stable ids
 * and `is_builtin = true` so admins can view, copy, and activate them. Each
 * stylesheet is typography/layout only — no color declarations — so it
 * passes the sanitizer unchanged and inherits the live color tokens.
 */

export interface BuiltInSystemTheme {
  id: string;
  name: string;
  css: string;
}

export const DEFAULT_THEME_ID = '00000000-0000-0000-0000-0000000000e1';
export const WIKIJS_THEME_ID = '00000000-0000-0000-0000-0000000000e2';

// Built-in CSS targets the content container (.prose.prose, doubled for
// specificity so it wins over the base globals.css .prose rules). Colors and
// backgrounds are intentionally omitted — they come from the active theme
// tokens — so the stylesheets pass the sanitizer unchanged.

const DEFAULT_CSS = `/* Default — the standard next-wiki content style. Copy and tweak to customize. */
/* Mirrors the built-in baseline: plain headings (no underline rules),
   token-driven sizes, a left-bordered blockquote, and bordered tables.
   Colors are inherited from the active theme tokens. */
.prose.prose {
  line-height: 1.75;
}
.prose.prose h1,
.prose.prose h2,
.prose.prose h3,
.prose.prose h4 {
  font-family: var(--font-display);
  font-weight: 600;
  margin-top: var(--space-xl);
  margin-bottom: var(--space-md);
}
.prose.prose h1 {
  font-size: var(--font-size-h1);
  line-height: 1.2;
}
.prose.prose h2 {
  font-size: var(--font-size-h2);
}
.prose.prose h3 {
  font-size: var(--font-size-h3);
}
.prose.prose p {
  margin-bottom: var(--space-md);
}
.prose.prose a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose.prose blockquote {
  padding-left: var(--space-md);
  border-left-width: 3px;
  border-left-style: solid;
  font-style: italic;
}
.prose.prose pre {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border-width: 1px;
  border-style: solid;
  font-size: 0.875rem;
}
.prose.prose code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
}
.prose.prose ul,
.prose.prose ol {
  padding-left: var(--space-lg);
  margin-bottom: var(--space-md);
}
.prose.prose ul {
  list-style-type: disc;
}
.prose.prose ol {
  list-style-type: decimal;
}
.prose.prose li {
  margin-bottom: var(--space-xs);
}
.prose.prose th,
.prose.prose td {
  padding: var(--space-sm) var(--space-md);
  border-width: 1px;
  border-style: solid;
  text-align: left;
}
.prose.prose th {
  font-weight: 600;
}
`;

const WIKIJS_CSS = `/* Wiki.js-inspired — GitHub-style content (Wiki.js renders Markdown this way). */
/* Sans-serif headings, h1/h2 underlined with a bottom rule, tighter body,
   GitHub-sized table cells and list indents. Border/line colors come from the
   active theme tokens (this theme sets only geometry). */
.prose.prose {
  line-height: 1.5;
}
.prose.prose h1,
.prose.prose h2,
.prose.prose h3,
.prose.prose h4 {
  font-family: var(--font-body);
  font-weight: 600;
  line-height: 1.25;
  margin-top: var(--space-xl);
  margin-bottom: var(--space-md);
}
.prose.prose h1 {
  font-size: 2em;
  padding-bottom: 0.3em;
  border-bottom-width: 1px;
  border-bottom-style: solid;
}
.prose.prose h2 {
  font-size: 1.5em;
  padding-bottom: 0.3em;
  border-bottom-width: 1px;
  border-bottom-style: solid;
}
.prose.prose h3 {
  font-size: 1.25em;
}
.prose.prose h4 {
  font-size: 1em;
}
.prose.prose p {
  margin-bottom: var(--space-md);
}
.prose.prose blockquote {
  position: relative;
  margin-top: var(--space-md);
  margin-bottom: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  padding-left: 4.5rem;
  min-height: 3.5rem;
  background-color: var(--color-surface-elevated);
  border-radius: var(--radius-md);
  border-left-width: 0;
  font-style: normal;
  overflow: hidden;
}
.prose.prose blockquote::before {
  /* Quote icon — edit this glyph to customize the blockquote icon. */
  content: '“';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-muted);
  color: var(--color-surface);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 2.75rem;
  line-height: 1;
}
.prose.prose pre {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  font-size: 0.85em;
}
.prose.prose code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 0.2em 0.4em;
  border-radius: var(--radius-sm);
}
.prose.prose ul,
.prose.prose ol {
  padding-left: 2em;
  margin-bottom: var(--space-md);
}
.prose.prose th,
.prose.prose td {
  padding: 0.375rem 0.8125rem;
  border-width: 1px;
  border-style: solid;
}
.prose.prose th {
  font-weight: 600;
}
`;

export const BUILTIN_THEMES: BuiltInSystemTheme[] = [
  { id: DEFAULT_THEME_ID, name: 'Default', css: DEFAULT_CSS },
  { id: WIKIJS_THEME_ID, name: 'Wiki.js-inspired', css: WIKIJS_CSS },
];
