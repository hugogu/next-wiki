import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import type { StaticSiteExclusionCounts, StaticSiteExclusionReason } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';

/**
 * The single decision point for what may be published (FR-007).
 *
 * Everything downstream — navigation, breadcrumbs, sitemap, link rewriting,
 * asset selection, the search index — is derived from the set this returns and
 * queries nothing further about eligibility. That is what makes the
 * release-blocking non-disclosure assertion checkable: there is exactly one
 * place to get this wrong, rather than one per consumer.
 *
 * A page is publishable only when ALL of these hold:
 *   1. not soft-deleted
 *   2. has a published revision
 *   3. visibility is public
 *   4. its space allows anonymous reading
 *   5. its space is an ordinary authored wiki space
 *
 * Condition 5 excludes raw-capture and generated-knowledge spaces regardless of
 * their visibility settings. Raw evidence is preserved for grounding, not for
 * readers, and generated knowledge has not passed authored review; publishing
 * either to a permanent, indexable, mirrored artifact carries different consent
 * and accuracy consequences than publishing an authored page.
 */

export type PublishablePage = {
  id: string;
  spaceId: string;
  path: string;
  // 035: canonical public address this page is published at — its own slug
  // for an original page, or its source page's slug for a translation (a
  // translation owns no independent slug). `path` remains the tree-structure
  // key (nav nesting, breadcrumb ancestry); `slug` is the actual href.
  slug: string;
  locale: string;
  title: string;
  translationGroupId: string | null;
  revisionId: string;
  versionNumber: number;
  contentSource: string;
  publishedAt: Date | null;
};

export type PublishableSet = {
  pages: PublishablePage[];
  /** `${locale}:${path}` → page id, for resolving internal (author-written,
   * tree-path-shaped) Markdown links against the publishable set. */
  pageIdsByAddress: Map<string, string>;
  /** `${locale}:${path}` → the target's canonical slug, for rewriting a
   * resolved internal link to its actual public address (035). */
  slugByAddress: Map<string, string>;
  /** translation group id → locale → slug (035), for the language switcher. */
  translationGroups: Map<string, Map<string, string>>;
  /** page id → its retained/manual alias addresses (035, US4), each already
   * fully formed (a translation's alias carries its own locale prefix as
   * text — see `setSlug`), so no further locale-prefixing applies. Scoped to
   * publishable pages only: an alias of an excluded page is not published. */
  aliasesByPageId: Map<string, string[]>;
  /** Assets referenced by the published revisions of publishable pages only. */
  assetIds: Set<string>;
  /** Counts only. A reason with a page attached would make this a disclosure channel. */
  exclusions: StaticSiteExclusionCounts;
  /** Default content locale of the wiki, used for address construction. */
  defaultLocale: string;
};

export function addressKey(locale: string, path: string): string {
  return `${locale}:${path}`;
}

function bump(counts: StaticSiteExclusionCounts, reason: StaticSiteExclusionReason): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

/**
 * Count what is being withheld and why, so an operator can see that a page is
 * missing on purpose rather than by failure (FR-012, FR-014).
 *
 * Counted in reason priority order — a deleted restricted page in a raw space
 * counts once, under the first reason that applies — so the totals sum to the
 * number of excluded pages rather than double-counting.
 */
async function countExclusions(): Promise<{ counts: StaticSiteExclusionCounts; total: number }> {
  const rows = await db
    .select({
      deletedAt: schema.pages.deletedAt,
      visibility: schema.pages.visibility,
      publishedVersionId: schema.pages.currentPublishedVersionId,
      spaceKind: schema.spaces.kind,
      anonymousRead: schema.spaces.anonymousRead,
    })
    .from(schema.pages)
    .innerJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id));

  const counts: StaticSiteExclusionCounts = {};
  let total = 0;
  for (const row of rows) {
    let reason: StaticSiteExclusionReason | null = null;
    if (row.deletedAt !== null) reason = 'deleted';
    else if (row.spaceKind === 'raw') reason = 'space_kind_raw';
    else if (row.spaceKind === 'generated') reason = 'space_kind_generated';
    else if (!row.anonymousRead) reason = 'space_not_anonymous';
    else if (row.visibility !== 'public') reason = 'restricted';
    else if (row.publishedVersionId === null) reason = 'not_published';

    if (reason) {
      bump(counts, reason);
      total += 1;
    }
  }
  return { counts, total };
}

export async function buildPublishableSet(defaultLocale = 'en'): Promise<PublishableSet> {
  const rows = await db
    .select({
      id: schema.pages.id,
      spaceId: schema.pages.spaceId,
      path: schema.pages.path,
      slug: schema.pages.slug,
      sourcePageId: schema.pages.sourcePageId,
      locale: schema.pages.locale,
      title: schema.pages.title,
      translationGroupId: schema.pages.translationGroupId,
      revisionId: schema.pageRevisions.id,
      versionNumber: schema.pageRevisions.versionNumber,
      contentSource: schema.pageRevisions.contentSource,
      publishedAt: schema.pageRevisions.publishedAt,
    })
    .from(schema.pages)
    .innerJoin(
      schema.pageRevisions,
      eq(schema.pages.currentPublishedVersionId, schema.pageRevisions.id),
    )
    .innerJoin(schema.spaces, eq(schema.pages.spaceId, schema.spaces.id))
    .where(
      and(
        isNull(schema.pages.deletedAt),
        eq(schema.pages.kind, 'native'),
        isNotNull(schema.pages.currentPublishedVersionId),
        eq(schema.pages.visibility, 'public'),
        eq(schema.spaces.anonymousRead, true),
        eq(schema.spaces.kind, 'wiki'),
        eq(schema.pageRevisions.status, 'published'),
      ),
    )
    .orderBy(schema.pages.path);

  // 035: a translation row owns no independent slug (always ''); its
  // canonical address is its source page's slug. Batched once rather than
  // per row.
  const sourcePageIds = [...new Set(rows.map((r) => r.sourcePageId).filter((id): id is string => id !== null))];
  const sourceSlugById = new Map<string, string>();
  if (sourcePageIds.length) {
    const sourceRows = await db
      .select({ id: schema.pages.id, slug: schema.pages.slug })
      .from(schema.pages)
      .where(inArray(schema.pages.id, sourcePageIds));
    for (const row of sourceRows) sourceSlugById.set(row.id, row.slug);
  }

  const pages: PublishablePage[] = rows.map(({ sourcePageId, ...row }) => ({
    ...row,
    slug: sourcePageId ? (sourceSlugById.get(sourcePageId) ?? row.slug) : row.slug,
    contentSource: row.contentSource ?? '',
  }));

  const pageIdsByAddress = new Map<string, string>();
  const slugByAddress = new Map<string, string>();
  const translationGroups = new Map<string, Map<string, string>>();
  for (const page of pages) {
    const key = addressKey(page.locale, page.path);
    pageIdsByAddress.set(key, page.id);
    slugByAddress.set(key, page.slug);
    if (page.translationGroupId) {
      // 035: `page.slug` is already the effective (source) slug for every
      // row in a translation group, so every locale entry resolves to the
      // same address — only the locale prefix varies.
      const group = translationGroups.get(page.translationGroupId) ?? new Map<string, string>();
      group.set(page.locale, page.slug);
      translationGroups.set(page.translationGroupId, group);
    }
  }

  // Assets are scoped to the published revisions of publishable pages only, so
  // an image used exclusively by a restricted page never reaches the artifact.
  const revisionIds = pages.map((page) => page.revisionId);
  const assetIds = new Set<string>();
  if (revisionIds.length > 0) {
    const refs = await db
      .select({ assetId: schema.contentAssets.id })
      .from(schema.contentAssetRefs)
      .innerJoin(schema.contentAssets, eq(schema.contentAssetRefs.assetId, schema.contentAssets.id))
      .where(
        and(
          inArray(schema.contentAssetRefs.revisionId, revisionIds),
          isNull(schema.contentAssets.deletedAt),
        ),
      );
    for (const ref of refs) assetIds.add(ref.assetId);
  }

  // 035 (US4): every retained/manual alias of a publishable page, keyed by
  // that page's own id (a translation's alias rows point at the translation
  // row itself, matching setSlug's write, not at its source).
  const aliasesByPageId = new Map<string, string[]>();
  const pageIds = pages.map((page) => page.id);
  if (pageIds.length > 0) {
    const aliasRows = await db
      .select({ pageId: schema.pageAddresses.pageId, address: schema.pageAddresses.address })
      .from(schema.pageAddresses)
      .where(inArray(schema.pageAddresses.pageId, pageIds));
    for (const row of aliasRows) {
      const list = aliasesByPageId.get(row.pageId) ?? [];
      list.push(row.address);
      aliasesByPageId.set(row.pageId, list);
    }
  }

  const { counts } = await countExclusions();

  return {
    pages,
    pageIdsByAddress,
    slugByAddress,
    translationGroups,
    aliasesByPageId,
    assetIds,
    exclusions: counts,
    defaultLocale,
  };
}

/** Pre-publish summary for the admin surface. Counts only, by design. */
export async function summarizeEligibility(): Promise<{
  publishable: number;
  excluded: number;
  exclusionsByReason: StaticSiteExclusionCounts;
}> {
  const [set, { counts, total }] = await Promise.all([buildPublishableSet(), countExclusions()]);
  return {
    publishable: set.pages.length,
    excluded: total,
    exclusionsByReason: counts,
  };
}
