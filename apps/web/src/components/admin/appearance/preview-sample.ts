/**
 * Sample Markdown rendered through the real pipeline for the system-theme live
 * preview. Using the actual renderer means the preview shows true syntax
 * highlighting, KaTeX math, and Mermaid diagrams — and the admin's CSS can
 * target `.hljs`, `.katex`, and `.mermaid` exactly as on real pages.
 */
export const PREVIEW_SAMPLE_MARKDOWN = `# Heading level 1

Body text shows how paragraphs read, with a [sample link](#) inline.

## Heading level 2

> A blockquote to preview the quote style.

\`\`\`js
function greet(name) {
  const greeting = 'Hello';
  return \`\${greeting}, \${name}!\`;
}
\`\`\`

### Heading level 3

- First list item
- Second list item

| Token | Value |
| ----- | ----- |
| h1    | 2rem  |
| code  | mono  |

Inline math $E = mc^2$ and a display equation:

$$\\int_{0}^{\\infty} e^{-x}\\,dx = 1$$

\`\`\`mermaid
graph LR
  A[Start] --> B{OK?}
  B -->|Yes| C[Done]
  B -->|No| A
\`\`\`
`;
