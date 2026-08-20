import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { pageAddressSchema } from '@next-wiki/shared';
import { addressReservation, describeAddressReservation } from '@/server/routes/reserved-paths';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The single chokepoint for the address namespace (035): every slug or alias
 * write, on every path (editor, API, MCP, import, migration), MUST call this
 * before writing. It is the only place that decides whether an address may be
 * claimed, so "one authoritative namespace" is enforced by code structure, not
 * by convention.
 *
 * Rejects when `address`:
 *   1. fails `pageAddressSchema` (malformed, uppercase, non-ASCII, too long);
 *   2. has a reserved leading segment (built-in route, locale, static-site
 *      prefix);
 *   3. equals another page's canonical slug in this space — including a
 *      soft-deleted page's slug (FR-014a);
 *   4. exists as another page's alias in `page_addresses` in this space.
 *
 * `selfPageId`, when supplied, exempts rows already owned by that page (an
 * unchanged slug, or re-validating one of the page's own aliases).
 *
 * Uniqueness is ultimately enforced by the database (`pages_space_slug_unique`,
 * `page_addresses_space_address_unique`); this function gives an actionable
 * error before the write is attempted, but callers must still handle the
 * unique-violation case for a race between two concurrent writers.
 */
export async function assertAddressAvailable(
  tx: Tx,
  spaceId: string,
  address: string,
  selfPageId?: string,
): Promise<void> {
  const parsed = pageAddressSchema.safeParse(address);
  if (!parsed.success) {
    throw new DomainError(
      'PAGE_SLUG_INVALID',
      parsed.error.issues[0]?.message ?? 'Invalid page address',
    );
  }

  const reservation = addressReservation(parsed.data);
  if (reservation) {
    throw new DomainError('PAGE_SLUG_RESERVED', describeAddressReservation(reservation));
  }

  const slugHolder = await tx.query.pages.findFirst({
    where: selfPageId
      ? and(eq(schema.pages.spaceId, spaceId), eq(schema.pages.slug, parsed.data), ne(schema.pages.id, selfPageId))
      : and(eq(schema.pages.spaceId, spaceId), eq(schema.pages.slug, parsed.data)),
  });
  if (slugHolder) {
    throw new DomainError(
      'PAGE_SLUG_TAKEN',
      `Address "${parsed.data}" is already the canonical address of another page.`,
    );
  }

  const aliasHolder = await tx.query.pageAddresses.findFirst({
    where: and(eq(schema.pageAddresses.spaceId, spaceId), eq(schema.pageAddresses.address, parsed.data)),
  });
  if (aliasHolder && aliasHolder.pageId !== selfPageId) {
    throw new DomainError(
      'PAGE_ADDRESS_TAKEN',
      `Address "${parsed.data}" is already an alias of another page.`,
    );
  }
}

/**
 * Change a page's canonical address (035, US2). Validates the new address
 * through `assertAddressAvailable`, then — only when the page has already
 * been published (FR-008) — retains the former slug, plus one
 * locale-prefixed address per published translation, as `kind: 'retained'`
 * aliases so every link built against the old address still resolves
 * (single hop, enforced at write time per research R6/R9).
 *
 * Existing `page_addresses` rows for this page need no update: every row
 * stores `address -> page_id` directly, never `address -> address`, so a
 * chain can never form and there is nothing to re-point (research R6).
 *
 * Callers MUST run this inside the same transaction as any other mutation on
 * the page (there is none today, but the migration write path in a later
 * task shares this transaction boundary).
 */
export async function setSlug(
  tx: Tx,
  spaceId: string,
  pageId: string,
  nextSlug: string,
): Promise<{ slug: string; retainedAlias: string | null; affectedTranslationLocales: string[] }> {
  const page = await tx.query.pages.findFirst({
    where: and(eq(schema.pages.id, pageId), eq(schema.pages.spaceId, spaceId)),
  });
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  if (page.translationGroupId) {
    throw new DomainError('BAD_REQUEST', 'A translation has no independent address');
  }

  const previousSlug = page.slug;
  if (nextSlug === previousSlug) return { slug: previousSlug, retainedAlias: null, affectedTranslationLocales: [] };

  await assertAddressAvailable(tx, spaceId, nextSlug, pageId);

  await tx
    .update(schema.pages)
    .set({ slug: nextSlug, updatedAt: new Date() })
    .where(eq(schema.pages.id, pageId));

  const isPublished = page.currentPublishedVersionId !== null;
  if (!isPublished) return { slug: nextSlug, retainedAlias: null, affectedTranslationLocales: [] };

  // A rename back to a previously-retained alias (A -> B -> A) leaves a
  // now-redundant row whose address equals the page's own new canonical
  // slug; drop it so no alias ever duplicates the canonical address.
  await tx
    .delete(schema.pageAddresses)
    .where(and(eq(schema.pageAddresses.pageId, pageId), eq(schema.pageAddresses.address, nextSlug)));

  await tx
    .insert(schema.pageAddresses)
    .values({ spaceId, address: previousSlug, pageId, kind: 'retained', reason: 'slug_change' })
    .onConflictDoNothing();

  const translations = await tx.query.pages.findMany({
    where: and(
      eq(schema.pages.sourcePageId, pageId),
      isNotNull(schema.pages.currentPublishedVersionId),
      isNull(schema.pages.deletedAt),
    ),
  });
  for (const translation of translations) {
    await tx
      .insert(schema.pageAddresses)
      .values({
        spaceId,
        address: `${translation.locale}/${previousSlug}`,
        pageId: translation.id,
        kind: 'retained',
        reason: 'slug_change',
      })
      .onConflictDoNothing();
  }

  return { slug: nextSlug, retainedAlias: previousSlug, affectedTranslationLocales: translations.map((t) => t.locale) };
}

/**
 * Resolve a `page_addresses` hit to the *current* address of its target
 * (035, US2/FR-009). Never returns the alias itself — only the canonical
 * slug (and, for a translation target, its locale) the caller should now
 * resolve through the ordinary steps 2-3 lookups, so redirect targets always
 * reflect the latest rename and permission checks run exactly as they would
 * for a direct hit.
 */
export async function resolveAddressTarget(
  spaceId: string,
  address: string,
): Promise<{ slug: string; locale: string | null } | null> {
  const row = await db.query.pageAddresses.findFirst({
    where: and(eq(schema.pageAddresses.spaceId, spaceId), eq(schema.pageAddresses.address, address)),
  });
  if (!row) return null;

  const target = await db.query.pages.findFirst({ where: eq(schema.pages.id, row.pageId) });
  if (!target) return null;

  if (target.sourcePageId) {
    const source = await db.query.pages.findFirst({ where: eq(schema.pages.id, target.sourcePageId) });
    if (!source) return null;
    return { slug: source.slug, locale: target.locale };
  }
  return { slug: target.slug, locale: null };
}
