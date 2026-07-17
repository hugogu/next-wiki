/**
 * Canonical first-run onboarding sample/help page content. The demo seed and
 * the onboarding sample-page writer share these definitions so both produce
 * the same pages; production deployments only get them when the Admin opts in
 * during onboarding (or explicitly enables the demo seed).
 */

/** Marks setup-owned sample content so reruns stay idempotent and
 * user-authored pages at the same paths are detected as collisions. */
export const SAMPLE_PAGE_MARKER = '<!-- next-wiki:sample-page -->';

/** Marks the onboarding "next steps" block appended to an existing welcome
 * page, so enrichment is idempotent. */
export const ONBOARDING_LINKS_MARKER = '<!-- next-wiki:onboarding-links -->';

export const SAMPLE_PAGE_PATHS = {
  welcome: 'welcome',
  markdownSyntax: 'help/markdown-syntax',
  mainFeatures: 'help/main-features',
} as const;

export const WELCOME_PAGE_TITLE = 'Welcome to next-wiki';
export const MARKDOWN_SYNTAX_PAGE_TITLE = 'Markdown Syntax Guide';
export const MAIN_FEATURES_PAGE_TITLE = 'Main Features Guide';

export const WELCOME_PAGE_SOURCE = `# Welcome to next-wiki

This is the first published page. Every page is authored in **Markdown** and rendered to HTML when saved so readers see fast, static-like pages.

## What you can do

| Feature | Editor | Reader | Admin |
| --- |:---:|:---:|:---:|
| Read published pages | ✓ | ✓ | ✓ |
| Draft and edit pages | ✓ | — | ✓ |
| Publish revisions | ✓ | — | ✓ |
| Manage users | — | — | ✓ |

## Markdown support

Pages support standard Markdown plus GitHub-flavored extras such as tables, task lists, fenced code blocks with syntax highlighting, LaTeX math, and Mermaid diagrams.

\`\`\`js
// A small example
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('next-wiki'));
\`\`\`

### Math

Inline math: $E = mc^2$

Block math:

$$
\\int_{0}^{\\infty} e^{-x} \\, dx = 1
$$

### Diagrams

\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
\`\`\`

## Try it out

- Click **New page** to create a draft.
- Use the split editor to write Markdown and preview the result side by side.
- Publish a revision when you are ready to share it.

> **Tip:** Code blocks use language tags like \`js\`, \`ts\`, \`json\`, \`sql\`, \`yaml\`, or \`mermaid\`. LaTeX is wrapped in \`$...$\` or \`$$...$$\`.
`;

export const ONBOARDING_WELCOME_LINKS_BLOCK = `
${ONBOARDING_LINKS_MARKER}

## Next steps

- Learn the syntax in the [Markdown Syntax Guide](/help/markdown-syntax).
- Tour the product in the [Main Features Guide](/help/main-features).
`;

/** Welcome content used when onboarding creates the welcome page itself. */
export const ONBOARDING_WELCOME_PAGE_SOURCE = `${WELCOME_PAGE_SOURCE.trimEnd()}\n${SAMPLE_PAGE_MARKER}\n${ONBOARDING_WELCOME_LINKS_BLOCK}`;

export const MARKDOWN_SYNTAX_PAGE_SOURCE = `# Markdown Syntax Guide

${SAMPLE_PAGE_MARKER}

Every next-wiki page is plain Markdown. This guide demonstrates each supported feature so you can copy the snippets into your own pages.

## Headings

Use one to six \`#\` characters. The first level-1 heading becomes the page title.

## Emphasis

*Italic*, **bold**, ~~strikethrough~~, and \`inline code\`.

## Lists

Unordered:

- First item
- Second item
  - Nested item

Ordered:

1. Draft the page
2. Review the preview
3. Publish the revision

Task lists:

- [x] Write this guide
- [ ] Publish your first page

## Links

Internal pages are linked by path: [Welcome](/welcome) and [Main Features Guide](/help/main-features). External links work too: [CommonMark](https://commonmark.org).

## Images

\`\`\`md
![Alt text describing the image](/api/assets/example.png)
\`\`\`

Upload images with the editor toolbar; they are stored in the configured content backend and rendered inline.

## Tables

| Syntax | Result |
| --- | --- |
| \`**bold**\` | **bold** |
| \`*italic*\` | *italic* |

## Code blocks

Fenced blocks support syntax highlighting:

\`\`\`ts
export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
\`\`\`

## Math

Inline math: $a^2 + b^2 = c^2$

Block math:

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

## Diagrams

\`\`\`mermaid
flowchart LR
    Draft --> Review --> Publish
    Review --> Draft
\`\`\`

## Blockquotes

> Published pages are cached for fast anonymous reading; publishing a new revision invalidates the cache automatically.
`;

export const MAIN_FEATURES_PAGE_SOURCE = `# Main Features Guide

${SAMPLE_PAGE_MARKER}

next-wiki is an AI-native wiki. This tour covers the core capabilities and where to find them.

## Page authoring

- Create pages from **New page**; every page lives at a stable path like \`help/main-features\`.
- Write in the split Markdown editor with live preview (see the [Markdown Syntax Guide](/help/markdown-syntax)).

## Revision history and publishing

- Saving creates a draft revision; nothing goes live until you publish it.
- Publishing creates an immutable, versioned revision with full history and diffs.
- Readers always see the latest published revision.

## Navigation and search

- The page tree in the sidebar mirrors your page paths.
- Full-text and fuzzy search find pages by title and content.

## AI features (optional)

When an AI provider is configured by an administrator:

- **Wiki chat**: ask questions answered from your wiki content, with citations.
- **Semantic search**: embeddings retrieve related pages even without keyword matches.
- **Image generation**: create illustrations for pages from a prompt.

AI is optional: the wiki is fully usable without it, and every AI feature is permission-scoped.

## Import and export

- Import content from other wiki systems or Markdown archives from the admin transfers screen.
- Export pages for backup or migration.

## Administration

Administrators manage users, AI providers and models, storage backends, site identity, and translations from the **Admin** area.

> **Tip:** You can edit or delete this page at any time — it is a normal wiki page created during first-run setup.
`;
