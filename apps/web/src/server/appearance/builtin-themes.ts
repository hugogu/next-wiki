/**
 * Built-in system-theme CSS templates (006). Admin picks one as a starting
 * point and customizes from there. The templates are typography/layout only —
 * no color/background declarations — so they pass the sanitizer unchanged and
 * inherit the live `--color-*` / `--font-*` tokens.
 *
 * `Default` is an empty stylesheet; `Wiki.js-inspired` mimics the Wiki.js
 * reading style (bolder headings, tighter body, accent underlines) for admins
 * who want a recognizable starting point.
 */

export interface BuiltInSystemTemplate {
  id: string;
  name: string;
  css: string;
}

export const EMPTY_TEMPLATE_ID = 'empty';
export const WIKIJS_TEMPLATE_ID = 'wikijs';

const EMPTY_CSS = '';

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

export const BUILTIN_TEMPLATES: BuiltInSystemTemplate[] = [
  { id: EMPTY_TEMPLATE_ID, name: 'Default', css: EMPTY_CSS },
  { id: WIKIJS_TEMPLATE_ID, name: 'Wiki.js-inspired', css: WIKIJS_CSS },
];
