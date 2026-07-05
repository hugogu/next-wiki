import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

type ImageNode = {
  type: 'image';
  url: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
};

export type MarkdownImageReference = {
  url: string;
  start: number;
  end: number;
};

export function findMarkdownImages(markdown: string): MarkdownImageReference[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const results: MarkdownImageReference[] = [];
  visit(tree, 'image', (node) => {
    const image = node as ImageNode;
    const start = image.position?.start.offset;
    const end = image.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const raw = markdown.slice(start, end);
    const urlIndex = raw.indexOf(image.url);
    if (urlIndex < 0) return;
    results.push({
      url: image.url,
      start: start + urlIndex,
      end: start + urlIndex + image.url.length,
    });
  });
  return results;
}

export function extractLocalAssetIds(markdown: string): string[] {
  return [
    ...new Set(
      findMarkdownImages(markdown)
        .map(({ url }) => /^\/api\/assets\/([0-9a-f-]{36})(?:[?#].*)?$/i.exec(url)?.[1])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function rewriteMarkdownImages(
  markdown: string,
  replacer: (url: string) => string | null,
): string {
  const references = findMarkdownImages(markdown).sort((a, b) => b.start - a.start);
  let output = markdown;
  for (const reference of references) {
    const replacement = replacer(reference.url);
    if (replacement === null) continue;
    output = `${output.slice(0, reference.start)}${replacement}${output.slice(reference.end)}`;
  }
  return output;
}

export function portableAssetReference(pageEntry: string, assetEntry: string): string {
  const relative = path.posix.relative(path.posix.dirname(pageEntry), assetEntry);
  return relative.startsWith('.') ? relative : `./${relative}`;
}

// ---------------------------------------------------------------------------
// 010: AI Curation API — outbound link graph
// ---------------------------------------------------------------------------

type LinkNode = {
  type: 'link';
  url: string;
  children?: Array<{ value?: string }>;
};

export type MarkdownLink = {
  /** Obsidian-style `[[wikilink]]` vs a standard Markdown `[text](url)` link. */
  source: 'wiki' | 'markdown';
  /** Raw target as written: a relative/absolute page path, an API page URL, or a wikilink target. */
  target: string;
  linkText: string;
  /** `https://...` targets are not subject to the wiki's permission/resolution model. */
  external: boolean;
};

const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Finds standard Markdown links and `[[wikilink]]` / `[[wikilink|alias]]` references. */
export function findMarkdownLinks(markdown: string): MarkdownLink[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const results: MarkdownLink[] = [];
  visit(tree, 'link', (node) => {
    const link = node as LinkNode;
    const linkText = (link.children ?? []).map((child) => child.value ?? '').join('');
    results.push({
      source: 'markdown',
      target: link.url,
      linkText: linkText || link.url,
      external: /^https?:\/\//i.test(link.url),
    });
  });
  for (const match of markdown.matchAll(WIKILINK_PATTERN)) {
    const target = match[1]!.trim();
    const alias = match[2]?.trim();
    results.push({ source: 'wiki', target, linkText: alias || target, external: false });
  }
  return results;
}

/** Reads the `related_pages` frontmatter key, if present and shaped as a string array. */
export function findFrontmatterRelatedPages(frontmatter: Record<string, unknown> | null): string[] {
  const related = frontmatter?.related_pages;
  if (!Array.isArray(related)) return [];
  return related.filter((entry): entry is string => typeof entry === 'string');
}
