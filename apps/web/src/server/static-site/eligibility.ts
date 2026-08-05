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
  /** `${locale}:${path}` → page id, for resolving internal links. */
  pageIdsByAddress: Map<string, string>;
  /** translation group id → locale → path, for the language switcher. */
  translationGroups: Map<string, Map<string, string>>;
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

  const pages: PublishablePage[] = rows.map((row) => ({
    ...row,
    contentSource: row.contentSource ?? '',
  }));

  const pageIdsByAddress = new Map<string, string>();
  const translationGroups = new Map<string, Map<string, string>>();
  for (const page of pages) {
    pageIdsByAddress.set(addressKey(page.locale, page.path), page.id);
    if (page.translationGroupId) {
      const group = translationGroups.get(page.translationGroupId) ?? new Map<string, string>();
      group.set(page.locale, page.path);
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

  const { counts } = await countExclusions();

  return {
    pages,
    pageIdsByAddress,
    translationGroups,
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
