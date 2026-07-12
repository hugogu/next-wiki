import { createHash } from 'node:crypto';
import { unified } from 'unified';
import type { Root, Element, Text } from 'hast';
import { defaultSchema } from 'hast-util-sanitize';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { markdownBody } from '@/server/metadata/frontmatter';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'data-line'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className', 'data-code-block', 'data-mermaid-block'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    button: [...(defaultSchema.attributes?.button ?? []), 'className'],
  },
};

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && (node as Element).type === 'element';
}

const LINE_ANCHOR_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'blockquote', 'pre', 'tr', 'hr', 'table',
]);

/**
 * Stamp block-level elements with the 1-indexed source line they came from,
 * so the editor's split-pane preview can scroll-sync by content position
 * instead of raw scroll percentage. Must run before `wrapCodeBlocks` (which
 * rebuilds the parent chain around `<pre>`, but shallow-copies its
 * `properties` onto the nested node, so an attribute set here survives) and
 * before `rehypeSanitize` (which strips unlisted attributes).
 */
function addLineAnchors(tree: Root) {
  visit(tree, 'element', (node) => {
    if (!isElement(node) || !LINE_ANCHOR_TAGS.has(node.tagName)) return;
    const line = node.position?.start.line;
    if (line === undefined) return;
    node.properties = { ...node.properties, 'data-line': line };
  });
}

/**
 * Mark images for lazy, non-blocking loading so a page (or the editor preview,
 * which re-renders on every keystroke) does not eagerly fetch every referenced
 * image at once — important when the read backend is remote (e.g. S3).
 */
function setImageLoading(tree: Root) {
  visit(tree, 'element', (node) => {
    if (!isElement(node) || node.tagName !== 'img') return;
    node.properties = { ...node.properties, loading: 'lazy', decoding: 'async' };
  });
}

function wrapCodeBlocks(tree: Root) {
  const matches: Element[] = [];
  visit(tree, 'element', (node) => {
    if (
      !isElement(node) ||
      node.tagName !== 'pre' ||
      !node.children ||
      node.children.length === 0
    ) {
      return;
    }

    const code = node.children[0];
    if (!isElement(code) || code.tagName !== 'code' || !code.properties) {
      return;
    }

    const className = code.properties.className;
    const lang = Array.isArray(className)
      ? className.find((c): c is string => typeof c === 'string' && c.startsWith('language-'))
      : undefined;

    const source = (code.children ?? [])
      .filter((child): child is Text => child.type === 'text')
      .map((child) => child.value)
      .join('');

    matches.push(node);

    if (lang === 'language-mermaid') {
      node.properties = { className: ['mermaid'] };
      node.children = [{ type: 'text', value: source }];
      node.data = { wrapper: 'mermaid' } as Record<string, unknown>;
    } else {
      node.data = { wrapper: 'code' } as Record<string, unknown>;
    }
  });

  for (const node of matches) {
    const wrapperType = (node.data as Record<string, unknown> | undefined)?.wrapper as 'code' | 'mermaid';
    const dataAttr = wrapperType === 'mermaid' ? 'data-mermaid-block' : 'data-code-block';
    const preNode: Element = { ...node, data: undefined };
    Object.assign(node, {
      type: 'element',
      tagName: 'div',
      properties: { [dataAttr]: '' },
      children: [preNode],
      data: undefined,
    });
  }
}

export function renderMarkdown(source: string): { html: string; hash: string } {
  const body = markdownBody(source);
  const html = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(() => addLineAnchors)
    .use(rehypeSanitize, sanitizeSchema)
    .use(() => setImageLoading)
    // Render imported/third-party math best-effort without flooding logs with
    // KaTeX strict-mode warnings (Unicode in math, comments, etc.).
    .use(rehypeKatex, { strict: 'ignore' })
    .use(() => wrapCodeBlocks)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .processSync(body)
    .toString();

  const hash = createHash('sha256').update(source).digest('hex');
  return { html, hash };
}
