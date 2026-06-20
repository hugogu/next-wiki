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

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), 'className', 'data-code-block', 'data-mermaid-block'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
    button: [...(defaultSchema.attributes?.button ?? []), 'className'],
  },
};

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && (node as Element).type === 'element';
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
  const html = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(() => setImageLoading)
    .use(rehypeKatex)
    .use(() => wrapCodeBlocks)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .processSync(source)
    .toString();

  const hash = createHash('sha256').update(source).digest('hex');
  return { html, hash };
}
