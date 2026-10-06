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
 *
 * One spelling differs between the two. A table cell cannot hold a bare `|`, so
 * an alias there is written `[[target\|alias]]`; this scan sees the target with
 * that backslash on it, while the renderer resolves the text after Markdown has
 * dropped it. Both spellings are collected.
 */
export function collectWikiLinkTargets(markdown: string): string[] {
  const targets = new Set<string>();
  for (const match of markdown.matchAll(WIKILINK_PATTERN)) {
    const link = parseWikiLink(match);
    if (!link) continue;
    for (const written of [link.target, link.target.replace(/\\$/, '')]) {
      const target = normalizeWikiLinkTarget(written);
      if (target) targets.add(target);
    }
  }
  return [...targets];
}

export type WikiLinkCandidate = { path: string; slug: string; title: string };

/**
 * A title as a reader perceives it: case and surrounding whitespace tell two
 * titles apart no better than they tell two words apart. The candidate lookup
 * (`server/services/wiki-links.ts`) compares this same key in SQL, so a row the
 * database returns for a title is one `matchWikiLinkTarget` can match.
 */
export function wikiLinkTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Pick the page a target refers to.
 *
 * A wikilink is written by hand (or by an agent mirroring a vault), so it is
 * rarely a page's full address. People write one of three things: the address
 * (`[[knowledge/ops/foo]]`), the tail of it (`[[ops/foo]]`), or the name the
 * page shows (`[[Multi registry]]`, the way a page is linked in Obsidian).
 *
 * The rules run from the most exact claim to the loosest — slug, tree path,
 * title, then a path suffix — and the first one that matches anything decides.
 * Exact addresses win first: an author who wrote the whole thing gets exactly
 * what they asked for. Within a rule, one page is a match and several are not:
 * an ambiguous target resolves to nothing, and does not fall through to a
 * looser rule, because silently linking to the wrong page is worse than
 * linking to a page that turns out not to exist.
 */
export function matchWikiLinkTarget<T extends WikiLinkCandidate>(
  target: string,
  candidates: readonly T[],
): T | null {
  const targetTitleKey = wikiLinkTitleKey(target);
  const rules: Array<(candidate: T) => boolean> = [
    (candidate) => candidate.slug === target,
    (candidate) => candidate.path === target,
    (candidate) => wikiLinkTitleKey(candidate.title) === targetTitleKey,
    (candidate) => candidate.slug.endsWith(`/${target}`) || candidate.path.endsWith(`/${target}`),
  ];
  for (const rule of rules) {
    const matches = candidates.filter(rule);
    if (matches.length > 0) return matches.length === 1 ? matches[0]! : null;
  }
  return null;
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
