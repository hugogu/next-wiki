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
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { env } from '@/server/config';
import { validateImage } from '@/server/content-store/image-validation';
import { markdownBody } from '@/server/metadata/frontmatter';
import { normalizeDisplayMath } from './normalize-display-math';

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

/**
 * Decode a standard, padded Base64 value without allowing Buffer's permissive
 * decoder to turn arbitrary text into bytes. Diagram exports are commonly
 * wrapped across lines, so whitespace is ignored before validation.
 */
function decodeBase64(value: string): Buffer | null {
  const normalized = value.replace(/\s/g, '');
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)
  ) {
    return null;
  }
  return Buffer.from(normalized, 'base64');
}

/**
 * Render draw.io-style `diagram` fences, whose body is a Base64 SVG export,
 * as a safe inline image. The SVG goes through the same type validation and
 * sanitization as uploaded assets before it reaches the HTML output. Invalid
 * fences deliberately remain ordinary code blocks so Markdown never gains a
 * general-purpose `data:` image escape hatch.
 */
function renderEncodedDiagrams(tree: Root) {
  visit(tree, 'element', (node) => {
    if (!isElement(node) || node.tagName !== 'pre' || node.children.length !== 1) return;

    const code = node.children[0];
    if (!isElement(code) || code.tagName !== 'code') return;

    const className = code.properties.className;
    const isDiagram = Array.isArray(className) && className.includes('language-diagram');
    if (!isDiagram) return;

    const encoded = (code.children ?? [])
      .filter((child): child is Text => child.type === 'text')
      .map((child) => child.value)
      .join('');
    const bytes = decodeBase64(encoded);
    if (!bytes) return;

    const image = validateImage(bytes, env.CONTENT_ASSET_MAX_BYTES);
    if (!image.ok || image.contentType !== 'image/svg+xml') return;

    node.tagName = 'img';
    node.properties = {
      ...node.properties,
      src: `data:image/svg+xml;base64,${image.bytes.toString('base64')}`,
      alt: 'Diagram',
    };
    node.children = [];
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
  const body = normalizeDisplayMath(markdownBody(source));
  const html = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    // Parse raw HTML so imported Markdown can retain safe elements such as
    // `<img>`. rehypeSanitize immediately following this step is the security
    // boundary: scripts, event handlers, and unsafe URL protocols are removed.
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(() => addLineAnchors)
    .use(rehypeSanitize, sanitizeSchema)
    .use(() => renderEncodedDiagrams)
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
