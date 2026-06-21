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
