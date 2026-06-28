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

const DEFAULT_CSS = `/* Default — the standard next-wiki content style. Copy and tweak to customize. */
/* Colors are inherited from the active theme tokens, so none are set here. */
h1,
h2,
h3,
h4 {
  font-family: var(--font-display);
  font-weight: 600;
  margin-top: var(--space-xl);
  margin-bottom: var(--space-md);
}
h1 {
  font-size: var(--font-size-h1);
  line-height: 1.2;
}
h2 {
  font-size: var(--font-size-h2);
}
h3 {
  font-size: var(--font-size-h3);
}
p {
  line-height: 1.75;
  margin-bottom: var(--space-md);
}
a {
  text-decoration: underline;
  text-underline-offset: 2px;
}
blockquote {
  padding-left: var(--space-md);
  border-left-width: 3px;
  border-left-style: solid;
  font-style: italic;
}
pre {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border-width: 1px;
  border-style: solid;
  font-size: 0.875rem;
}
code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
}
ul,
ol {
  padding-left: var(--space-lg);
  margin-bottom: var(--space-md);
}
ul {
  list-style-type: disc;
}
ol {
  list-style-type: decimal;
}
li {
  margin-bottom: var(--space-xs);
}
table {
  margin-bottom: var(--space-md);
  font-size: 0.9375rem;
}
th,
td {
  padding: var(--space-sm) var(--space-md);
  border-width: 1px;
  border-style: solid;
}
th {
  font-weight: 600;
}
`;

const WIKIJS_CSS = `/* Wiki.js-inspired — bolder headings with underlines, tighter body. */
h1 {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: var(--space-xl);
  padding-bottom: var(--space-xs);
  border-bottom-width: 1px;
  border-bottom-style: solid;
}
h2 {
  font-size: 1.5rem;
  font-weight: 700;
  padding-bottom: var(--space-xs);
  border-bottom-width: 1px;
  border-bottom-style: solid;
}
h3 {
  font-size: 1.25rem;
  font-weight: 700;
}
p {
  line-height: 1.6;
}
blockquote {
  padding: var(--space-sm) var(--space-md);
  border-left-width: 4px;
  border-left-style: solid;
  font-style: normal;
}
pre {
  padding: var(--space-md);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
}
code {
  font-family: var(--font-mono);
  font-size: 0.85em;
}
ul,
ol {
  padding-left: var(--space-xl);
}
th,
td {
  padding: var(--space-sm) var(--space-md);
  border-width: 1px;
  border-style: solid;
}
th {
  font-weight: 700;
}
`;

export const BUILTIN_THEMES: BuiltInSystemTheme[] = [
  { id: DEFAULT_THEME_ID, name: 'Default', css: DEFAULT_CSS },
  { id: WIKIJS_THEME_ID, name: 'Wiki.js-inspired', css: WIKIJS_CSS },
];
