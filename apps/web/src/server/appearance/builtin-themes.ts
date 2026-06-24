/**
 * Built-in Markdown reading themes (bounded registry, P9). Seeded into
 * `markdown_themes` with stable ids and `is_builtin = true` so users can view,
 * copy, and activate them. Each stylesheet targets Markdown elements directly
 * and controls **typography/layout only** — colors are never declared and
 * continue to inherit the system tokens (FR-011a). Borders use width/style
 * longhand so the system border color is preserved.
 */

export interface BuiltinTheme {
  id: string;
  name: string;
  css: string;
}

export const DEFAULT_THEME_ID = '00000000-0000-0000-0000-0000000000d1';
export const WIKIJS_THEME_ID = '00000000-0000-0000-0000-0000000000d2';

const DEFAULT_CSS = `/* Default — the standard next-wiki reading style. */
h1 {
  font-size: var(--font-size-h1);
  font-weight: 600;
  line-height: 1.2;
}
h2 {
  font-size: var(--font-size-h2);
  font-weight: 600;
}
h3 {
  font-size: var(--font-size-h3);
  font-weight: 600;
}
p {
  line-height: 1.75;
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
}
code {
  font-family: var(--font-mono);
}
th,
td {
  padding: var(--space-sm) var(--space-md);
  border-width: 1px;
  border-style: solid;
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

export const BUILTIN_THEMES: BuiltinTheme[] = [
  { id: DEFAULT_THEME_ID, name: 'Default', css: DEFAULT_CSS },
  { id: WIKIJS_THEME_ID, name: 'Wiki.js-inspired', css: WIKIJS_CSS },
];
