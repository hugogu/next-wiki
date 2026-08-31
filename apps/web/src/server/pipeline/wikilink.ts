import type { PhrasingContent, Root, Text } from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * Obsidian-style `[[target]]`, `[[target|alias]]` and `[[target#heading]]`
 * links.
 *
 * The syntax belongs to neither CommonMark nor GFM, so remark leaves it as
 * literal text. This module is the single definition of it: the render
 * pipeline turns the matches into links, and the outbound-link graph
 * (`server/transfers/markdown-links.ts`) reads the same matches, so what a
 * reader can click and what the link graph records can never disagree.
 *
 * Resolution itself lives outside this module. Rendering is synchronous and
 * database-free, so the caller supplies a resolver that already knows which
 * pages exist (`server/services/wiki-links.ts` for the wiki, the publishable
 * set for the static site).
 */

/** Global — iterate with `matchAll`, or reset `lastIndex` before reuse. */
export const WIKILINK_PATTERN = /\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g;

export type WikiLink = {
  /** Target as written, without the `#fragment` or the `|alias`. */
  target: string;
  /** The `#fragment` including its `#`, or an empty string. */
  hash: string;
  /** Text shown to the reader: the alias when given, else the target as written. */
  label: string;
};

export type WikiLinkResolver = (link: WikiLink) => string;

export function parseWikiLink(match: RegExpMatchArray): WikiLink | null {
  const target = (match[1] ?? '').trim();
  if (!target) return null;
  const hash = (match[2] ?? '').trim();
  const alias = match[3]?.trim();
  return { target, hash, label: alias || `${target}${hash}` };
}

/**
 * A target as a page address: leading slashes, a trailing slash, and the `.md`
 * extension an Obsidian vault carries are all noise here.
 */
export function normalizeWikiLinkTarget(target: string): string {
  return target.trim().replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.md$/i, '');
}

/**
 * Distinct, normalized targets of every wikilink in a document, used to
 * pre-load resolution candidates.
 *
 * Deliberately scans the raw source rather than the parsed tree: this only has
 * to be a superset of what `remarkWikiLink` will rewrite. Over-collecting costs
 * one extra row in a lookup and nothing else, while parsing the document twice
 * on every render would cost real time.
 */
export function collectWikiLinkTargets(markdown: string): string[] {
  const targets = new Set<string>();
  for (const match of markdown.matchAll(WIKILINK_PATTERN)) {
    const link = parseWikiLink(match);
    if (!link) continue;
    const target = normalizeWikiLinkTarget(link.target);
    if (target) targets.add(target);
  }
  return [...targets];
}

export type WikiLinkCandidate = { path: string; slug: string };

/**
 * Pick the page a target refers to.
 *
 * A wikilink is written by hand (or by an agent mirroring a vault), so it is
 * rarely a page's full address: `[[ops/foo]]` is how someone refers to
 * `knowledge/ops/foo`. Exact addresses win first — an author who wrote the
 * whole thing gets exactly what they asked for — and only then does a path
 * suffix count, and only when it names one page. An ambiguous suffix resolves
 * to nothing rather than to a guess: silently linking to the wrong page is
 * worse than linking to a page that turns out not to exist.
 */
export function matchWikiLinkTarget<T extends WikiLinkCandidate>(
  target: string,
  candidates: readonly T[],
): T | null {
  const exactSlug = candidates.filter((candidate) => candidate.slug === target);
  if (exactSlug.length === 1) return exactSlug[0]!;
  const exactPath = candidates.filter((candidate) => candidate.path === target);
  if (exactPath.length === 1) return exactPath[0]!;
  const suffix = candidates.filter(
    (candidate) => candidate.slug.endsWith(`/${target}`) || candidate.path.endsWith(`/${target}`),
  );
  return suffix.length === 1 ? suffix[0]! : null;
}

export function encodeWikiLinkPath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/**
 * Fallback for a render with no page context (the editor's live preview, chat
 * answers): the target as a site-root address. Good enough to show the author
 * that the link exists; the stored render resolves it against real pages.
 */
export function defaultWikiLinkHref(link: WikiLink): string {
  return `/${encodeWikiLinkPath(normalizeWikiLinkTarget(link.target))}${link.hash}`;
}

function splitWikiLinks(value: string, resolve: WikiLinkResolver): PhrasingContent[] | null {
  const nodes: PhrasingContent[] = [];
  let cursor = 0;
  for (const match of value.matchAll(WIKILINK_PATTERN)) {
    const link = parseWikiLink(match);
    if (!link || match.index === undefined) continue;
    if (match.index > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, match.index) });
    }
    nodes.push({
      type: 'link',
      url: resolve(link),
      title: null,
      children: [{ type: 'text', value: link.label }],
    });
    cursor = match.index + match[0].length;
  }
  if (nodes.length === 0) return null;
  if (cursor < value.length) nodes.push({ type: 'text', value: value.slice(cursor) });
  return nodes;
}

/**
 * Whether a text node is prose a wikilink may be written in. Code spans and
 * fenced blocks are separate node types and so never reach here; a wikilink
 * inside a Markdown link's text is skipped because it would nest an anchor.
 */
function isWikiLinkContext(parent: { type: string } | undefined): boolean {
  return parent !== undefined && parent.type !== 'link' && parent.type !== 'linkReference';
}

/**
 * Rewrite wikilinks found in prose into links. Working on the parsed tree
 * rather than the source is what keeps `[[…]]` inside code literal.
 */
export function remarkWikiLink(resolve: WikiLinkResolver) {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || !isWikiLinkContext(parent)) return;
      const replacement = splitWikiLinks(node.value, resolve);
      if (!replacement) return;
      (parent.children as PhrasingContent[]).splice(index, 1, ...replacement);
      return index + replacement.length;
    });
  };
}

/**
 * Every wikilink in a parsed document, in document order — exactly the ones
 * `remarkWikiLink` turns into links, so the recorded link graph and the links
 * a reader can click describe the same set.
 */
export function collectWikiLinks(tree: Root): WikiLink[] {
  const links: WikiLink[] = [];
  visit(tree, 'text', (node: Text, _index, parent) => {
    if (!isWikiLinkContext(parent)) return;
    for (const match of node.value.matchAll(WIKILINK_PATTERN)) {
      const link = parseWikiLink(match);
      if (link) links.push(link);
    }
  });
  return links;
}
