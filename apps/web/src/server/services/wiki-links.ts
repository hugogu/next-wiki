import { and, eq, inArray, isNotNull, isNull, like, or, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import {
  collectWikiLinkTargets,
  encodeWikiLinkPath,
  matchWikiLinkTarget,
  normalizeWikiLinkTarget,
  type WikiLinkResolver,
} from '@/server/pipeline/wikilink';
import { canonicalSpacePath, type RouteableSpace } from '@/server/services/space-routes';

export type WikiLinkSpace = RouteableSpace & { id: string };

/**
 * Whatever the caller is already writing through. A caller inside a
 * `db.transaction` must pass its `tx`: resolving on the pool instead would read
 * a different snapshot than the write it is about to make (an import creating
 * both pages in one transaction would fail to link them), and would need a
 * second connection while the first is held — the shape that exhausts a pool.
 */
export type WikiLinkExecutor = Pick<typeof db, 'select'>;

export type WikiLinkOptions = {
  executor?: WikiLinkExecutor;
  /**
   * The locale the document being rendered is read at. Set it when rendering a
   * translation; a target that is itself translated into this locale is then
   * addressed as that translation, so following a link does not silently drop
   * the reader back into the original language.
   */
  locale?: string | null;
};

/** Postgres `LIKE` treats these as wildcards; a page path may legitimately contain them. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Candidate rows for the targets a document links to.
 *
 * Only live, non-translation pages of this space are eligible: a wikilink is a
 * reference to a page, and a translation resolves through its source page's
 * address rather than owning one.
 */
async function findCandidates(executor: WikiLinkExecutor, spaceId: string, targets: string[]) {
  const conditions: SQL[] = [];
  for (const target of targets) {
    const suffix = `%/${escapeLikePattern(target)}`;
    conditions.push(
      eq(schema.pages.slug, target),
      eq(schema.pages.path, target),
      like(schema.pages.slug, suffix),
      like(schema.pages.path, suffix),
    );
  }
  return executor
    .select({ id: schema.pages.id, path: schema.pages.path, slug: schema.pages.slug })
    .from(schema.pages)
    .where(
      and(
        eq(schema.pages.spaceId, spaceId),
        isNull(schema.pages.deletedAt),
        isNull(schema.pages.sourcePageId),
        eq(schema.pages.kind, 'native'),
        or(...conditions),
      ),
    );
}

/**
 * Which of `pageIds` have a published translation in `locale`.
 *
 * Only a published one counts: the href is frozen into the stored HTML, and
 * addressing a draft translation would send a reader to a page they cannot
 * read. Falling back to the original always resolves.
 */
async function findTranslatedSources(
  executor: WikiLinkExecutor,
  pageIds: string[],
  locale: string,
): Promise<Set<string>> {
  if (pageIds.length === 0) return new Set();
  const rows = await executor
    .select({ sourcePageId: schema.pages.sourcePageId })
    .from(schema.pages)
    .where(
      and(
        inArray(schema.pages.sourcePageId, pageIds),
        eq(schema.pages.locale, locale),
        isNull(schema.pages.deletedAt),
        isNotNull(schema.pages.currentPublishedVersionId),
      ),
    );
  return new Set(rows.map((row) => row.sourcePageId).filter((id): id is string => id !== null));
}

/**
 * Build the resolver `renderMarkdown` uses to turn `[[target]]` into an href,
 * for a document being written into `space`.
 *
 * Resolution happens once, at render time, and is frozen into the stored HTML —
 * the same trade-off every other part of the rendered output already makes. A
 * link to a page created later stays unresolved until the page is re-rendered
 * (Page → Re-render, `services/page-rerender.ts`).
 *
 * An unresolved target still renders as a link, addressed inside this space as
 * written, so it behaves like any other Markdown link to a page that is not
 * there yet rather than silently becoming plain text.
 */
export async function createWikiLinkResolver(
  space: WikiLinkSpace,
  source: string,
  { executor = db, locale = null }: WikiLinkOptions = {},
): Promise<WikiLinkResolver> {
  const targets = collectWikiLinkTargets(source);
  const resolved = new Map<string, { slug: string; locale: string | null }>();

  if (targets.length > 0) {
    const candidates = await findCandidates(executor, space.id, targets);
    const matches = new Map<string, (typeof candidates)[number]>();
    for (const target of targets) {
      const match = matchWikiLinkTarget(target, candidates);
      if (match) matches.set(target, match);
    }
    const translated = locale
      ? await findTranslatedSources(executor, [...new Set([...matches.values()].map((m) => m.id))], locale)
      : new Set<string>();
    for (const [target, match] of matches) {
      resolved.set(target, { slug: match.slug, locale: translated.has(match.id) ? locale : null });
    }
  }

  return (link) => {
    const target = normalizeWikiLinkTarget(link.target);
    const match = resolved.get(target);
    return `${canonicalSpacePath(space, match?.slug ?? target, match?.locale ?? null)}${link.hash}`;
  };
}

/** `renderMarkdown` with this space's wikilinks resolved against its pages. */
export async function renderPageMarkdown(
  space: WikiLinkSpace,
  source: string,
  options: WikiLinkOptions = {},
): Promise<{ html: string; hash: string }> {
  return renderMarkdown(source, {
    resolveWikiLink: await createWikiLinkResolver(space, source, options),
  });
}

/**
 * Resolver for a set of pages already in memory, addressing targets by tree
 * path. Used by the static site generator, whose own link rewriter maps a
 * tree-path href onto the published artifact's address.
 */
export function createStaticWikiLinkResolver(
  candidates: readonly { path: string; slug: string }[],
): WikiLinkResolver {
  return (link) => {
    const target = normalizeWikiLinkTarget(link.target);
    const match = matchWikiLinkTarget(target, candidates);
    return `/${encodeWikiLinkPath(match?.path ?? target)}${link.hash}`;
  };
}
