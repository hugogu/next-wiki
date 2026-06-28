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

const DEFAULT_CSS = `/* Default — the standard next-wiki system style. */
/* Add your customizations below. */
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
