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
    div: [...(defaultSchema.attributes?.div ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
  },
};

function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && (node as Element).type === 'element';
}

function rehypeMermaid() {
  return (tree: Root) => {
    visit(tree, 'element', (node) => {
      if (!isElement(node) || node.tagName !== 'pre' || !node.children || node.children.length === 0) {
        return;
      }

      const code = node.children[0];
      if (!isElement(code) || code.tagName !== 'code' || !code.properties) {
        return;
      }

      const className = code.properties.className;
      if (!Array.isArray(className)) {
        return;
      }

      const lang = className.find((c) => typeof c === 'string' && c.startsWith('language-'));
      if (lang !== 'language-mermaid') {
        return;
      }

      const source = (code.children ?? [])
        .filter((child): child is Text => child.type === 'text')
        .map((child) => child.value)
        .join('');

      node.properties = { className: ['mermaid'] };
      node.children = [{ type: 'text', value: source }];
    });
  };
}

export function renderMarkdown(source: string): { html: string; hash: string } {
  const html = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeKatex)
    .use(rehypeMermaid)
    .use(rehypeHighlight)
    .use(rehypeStringify)
    .processSync(source)
    .toString();

  const hash = createHash('sha256').update(source).digest('hex');
  return { html, hash };
}
