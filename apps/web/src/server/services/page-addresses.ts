import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { pageAddressSchema } from '@next-wiki/shared';
import { addressReservation, describeAddressReservation } from '@/server/routes/reserved-paths';
import { can, getActorUserId, pagePermissionOptions, type PermCtx } from '@/server/permissions';
import { invalidatePublicContentCache } from '@/server/cache/public-cache';
import { enqueuePublicPageWarmup } from '@/server/services/public-page-warmup';
import { getPageHref } from '@/lib/path';
import { getReservedLocalePrefixes } from '@/server/services/translation-locales';
import * as audit from '@/server/services/audit';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ADDRESS_NAMESPACE_LOCK_SEED = 0x035;
const PAGE_ADDRESS_MAX_LENGTH = 200;

export type ImportAddressAdjustmentReason = 'invalid_characters' | 'reserved' | 'taken';

export type DerivedImportAddress = {
  address: string;
  reason: ImportAddressAdjustmentReason | null;
};

/**
 * Turns an external source path into a deterministic, valid public address
 * without ever changing the page that already owns a candidate (035 R8).
 */
export async function deriveImportAddress(
  sourcePath: string,
  taken: (address: string) => boolean,
  reservedLocales?: ReadonlySet<string>,
): Promise<DerivedImportAddress> {
  const source = sourcePath.normalize('NFC');
  const segments = source
    .toLowerCase()
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, ''))
    .filter(Boolean);
  let address = segments.join('/');
  let reason: ImportAddressAdjustmentReason | null = address === source ? null : 'invalid_characters';

  const reservedLocalePrefixes = reservedLocales ?? (await getReservedLocalePrefixes());
  if (!address || addressReservation(address, reservedLocalePrefixes)) {
    address = address ? `page/${address}` : 'page';
    reason = 'reserved';
  }

  address = limitAddressLength(address);
  if (taken(address)) {
    const base = address;
    let suffix = 2;
    do {
      address = withSuffix(base, suffix);
      suffix += 1;
    } while (taken(address));
    reason = 'taken';
  }

  return { address, reason };
}

function limitAddressLength(address: string): string {
  if (address.length <= PAGE_ADDRESS_MAX_LENGTH) return address;
  const segments = address.split('/');
  const overflow = address.length - PAGE_ADDRESS_MAX_LENGTH;
  const last = segments.at(-1)!;
  const shortened = last.slice(0, Math.max(1, last.length - overflow)).replace(/[-_]+$/, '') || 'page';
  segments[segments.length - 1] = shortened;
  return segments.join('/');
}

function withSuffix(address: string, suffix: number): string {
  const suffixText = `-${suffix}`;
  const allowedBaseLength = PAGE_ADDRESS_MAX_LENGTH - suffixText.length;
  const base = address.length > allowedBaseLength
    ? `${address.slice(0, allowedBaseLength).replace(/[-_/]+$/, '') || 'page'}`
    : address;
  return `${base}${suffixText}`;
}

/** Only what `pagePermissionOptions`/`assertAddressAvailable` need — accepts
 * any caller's space row shape, full or narrowed, structurally. */
type SpaceIdentity = { id: string; kind: 'wiki' | 'raw' | 'generated'; anonymousRead: boolean };

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
 * `ctx`, when supplied, enforces the disclosure rule (FR-018): a conflict
 * message names the conflicting page only when the caller may read it;
 * otherwise the message states only that the address is taken, never
 * revealing that a specific (unreadable) page exists there.
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
  ctx?: PermCtx,
  reservedLocales?: ReadonlySet<string>,
): Promise<void> {
  const parsed = pageAddressSchema.safeParse(address);
  if (!parsed.success) {
    throw new DomainError(
      'PAGE_SLUG_INVALID',
      parsed.error.issues[0]?.message ?? 'Invalid page address',
    );
  }

  const reservedLocalePrefixes = reservedLocales ?? (await getReservedLocalePrefixes());
  const reservation = addressReservation(parsed.data, reservedLocalePrefixes);
  if (reservation) {
    throw new DomainError('PAGE_SLUG_RESERVED', describeAddressReservation(reservation));
  }

  // Canonical and alias addresses use separate unique indexes, so neither
  // index can reject a concurrent canonical-versus-alias claim. Serialize
  // claims for this exact space/address pair, then inspect both tables.
  await tx.execute(sql`
    select pg_advisory_xact_lock(
      hashtextextended(${`${spaceId}:${parsed.data}`}, ${ADDRESS_NAMESPACE_LOCK_SEED})
    )
  `);

  const slugHolder = await tx.query.pages.findFirst({
    where: selfPageId
      ? and(eq(schema.pages.spaceId, spaceId), eq(schema.pages.slug, parsed.data), ne(schema.pages.id, selfPageId))
      : and(eq(schema.pages.spaceId, spaceId), eq(schema.pages.slug, parsed.data)),
  });
  if (slugHolder) {
    const title = await describeConflictHolder(tx, spaceId, slugHolder, ctx);
    throw new DomainError(
      'PAGE_SLUG_TAKEN',
      title
        ? `Address "${parsed.data}" is already the canonical address of "${title}".`
        : `Address "${parsed.data}" is already the canonical address of another page.`,
    );
  }

  const aliasHolder = await tx.query.pageAddresses.findFirst({
    where: and(eq(schema.pageAddresses.spaceId, spaceId), eq(schema.pageAddresses.address, parsed.data)),
  });
  if (aliasHolder && aliasHolder.pageId !== selfPageId) {
    const holderPage = await tx.query.pages.findFirst({ where: eq(schema.pages.id, aliasHolder.pageId) });
    const title = holderPage ? await describeConflictHolder(tx, spaceId, holderPage, ctx) : null;
    throw new DomainError(
      'PAGE_ADDRESS_TAKEN',
      title
        ? `Address "${parsed.data}" is already an alias of "${title}".`
        : `Address "${parsed.data}" is already an alias of another page.`,
    );
  }
}

/** FR-018 disclosure rule: name a conflicting page only when the caller may read it. */
async function describeConflictHolder(
  tx: Tx,
  spaceId: string,
  holder: typeof schema.pages.$inferSelect,
  ctx?: PermCtx,
): Promise<string | null> {
  if (!ctx) return null;
  const space = await tx.query.spaces.findFirst({ where: eq(schema.spaces.id, spaceId) });
  if (!space) return null;
  const readable = can(ctx, 'read', { kind: 'page', pageId: holder.id }, pagePermissionOptions(space, holder));
  return readable ? holder.title : null;
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
  ctx?: PermCtx,
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

  await assertAddressAvailable(tx, spaceId, nextSlug, pageId, ctx);

  await tx
    .update(schema.pages)
    .set({ slug: nextSlug, updatedAt: new Date() })
    .where(eq(schema.pages.id, pageId));

  // A rename back to a previously-retained alias (A -> B -> A) leaves a
  // now-redundant row whose address equals the page's own new canonical
  // slug; drop it so no alias ever duplicates the canonical address. This
  // applies to draft pages promoting one of their manual aliases too.
  await tx
    .delete(schema.pageAddresses)
    .where(and(eq(schema.pageAddresses.pageId, pageId), eq(schema.pageAddresses.address, nextSlug)));

  const isPublished = page.currentPublishedVersionId !== null;
  if (!isPublished) return { slug: nextSlug, retainedAlias: null, affectedTranslationLocales: [] };

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
 *
 * `spaceId` in the result is the space the target page lives in *now*, which
 * is not necessarily the space the alias was looked up in: a cross-space move
 * (FR-010) deliberately retains the pre-move address against the *source*
 * space while the page itself leaves it. Callers must run the final lookup
 * against the returned space, or the alias resolves to nothing.
 */
export async function resolveAddressTarget(
  spaceId: string,
  address: string,
): Promise<{ slug: string; locale: string | null; spaceId: string } | null> {
  const row = await db.query.pageAddresses.findFirst({
    where: and(eq(schema.pageAddresses.spaceId, spaceId), eq(schema.pageAddresses.address, address)),
  });
  if (!row) return null;

  const target = await db.query.pages.findFirst({ where: eq(schema.pages.id, row.pageId) });
  if (!target) return null;

  if (target.sourcePageId) {
    const source = await db.query.pages.findFirst({ where: eq(schema.pages.id, target.sourcePageId) });
    if (!source) return null;
    // A translation is only addressable through its source page, so the
    // source's space — not the translation row's — is where it resolves.
    return { slug: source.slug, locale: target.locale, spaceId: source.spaceId };
  }
  return { slug: target.slug, locale: null, spaceId: target.spaceId };
}

export type PageAddressView = {
  id: string;
  address: string;
  kind: 'retained' | 'manual';
  reason: string | null;
  createdAt: Date;
};

/**
 * List every address of a page: its canonical slug plus every retained and
 * manually added alias (FR-020).
 */
export async function listAddresses(pageId: string): Promise<{ canonical: string; aliases: PageAddressView[] }> {
  const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
  if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
  const rows = await db.query.pageAddresses.findMany({ where: eq(schema.pageAddresses.pageId, pageId) });
  return {
    canonical: page.slug,
    aliases: rows.map((row) => ({ id: row.id, address: row.address, kind: row.kind, reason: row.reason, createdAt: row.createdAt })),
  };
}

/**
 * Add a manually added alias to a page (FR-020, US4). Requires the same
 * `edit` permission that governs page properties (FR-022a) — adding an
 * alias cannot break anything a reader already holds, so it needs no
 * additional confirmation.
 */
export async function addAlias(
  ctx: PermCtx,
  space: SpaceIdentity,
  pageId: string,
  address: string,
): Promise<PageAddressView> {
  const userId = getActorUserId(ctx);
  const created = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    if (!can(ctx, 'edit', { kind: 'page', pageId }, pagePermissionOptions(space, page, { isAuthor: page.authorId === userId }))) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
    }
    const parsed = pageAddressSchema.safeParse(address);
    if (parsed.success && parsed.data === page.slug) {
      throw new DomainError('PAGE_ADDRESS_SELF', 'This address is already the page\'s own canonical address.');
    }
    await assertAddressAvailable(tx, space.id, address, pageId, ctx);
    const [row] = await tx
      .insert(schema.pageAddresses)
      .values({ spaceId: space.id, address, pageId, kind: 'manual' })
      .returning();
    return row!;
  });

  invalidatePublicContentCache();
  await enqueuePublicPageWarmup(getPageHref(created.address));

  return { id: created.id, address: created.address, kind: created.kind, reason: created.reason, createdAt: created.createdAt };
}

/**
 * Remove an address (FR-021, FR-022, US4). A manually added alias needs only
 * `edit` permission and is removed immediately. A retained alias can break a
 * link a reader already holds, so it additionally requires space-manage
 * permission (FR-022a) and an explicit `confirmBreakingPublicLinks` flag —
 * without it, `ADDRESS_ALIAS_RETAINED` states the consequence and the caller
 * must resubmit with confirmation (FR-022).
 */
export async function removeAlias(
  ctx: PermCtx,
  space: SpaceIdentity,
  pageId: string,
  aliasId: string,
  options: { confirmBreakingPublicLinks?: boolean } = {},
): Promise<{ address: string; kind: 'retained' | 'manual' }> {
  const userId = getActorUserId(ctx);
  const removed = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    const alias = await tx.query.pageAddresses.findFirst({
      where: and(eq(schema.pageAddresses.id, aliasId), eq(schema.pageAddresses.pageId, pageId)),
    });
    if (!alias) throw new DomainError('NOT_FOUND', 'Address not found');

    if (alias.kind === 'manual') {
      if (!can(ctx, 'edit', { kind: 'page', pageId }, pagePermissionOptions(space, page, { isAuthor: page.authorId === userId }))) {
        throw new DomainError('FORBIDDEN', 'You do not have permission to edit this page');
      }
    } else {
      if (!can(ctx, 'manage_page_addresses', { kind: 'page', pageId }, pagePermissionOptions(space, page))) {
        throw new DomainError('FORBIDDEN', 'Removing a retained alias requires space-manage permission');
      }
      if (!options.confirmBreakingPublicLinks) {
        throw new DomainError(
          'ADDRESS_ALIAS_RETAINED',
          `Removing "${alias.address}" will permanently break any existing public link to it. Confirm to proceed.`,
        );
      }
    }

    await tx.delete(schema.pageAddresses).where(eq(schema.pageAddresses.id, aliasId));
    return alias;
  });

  invalidatePublicContentCache();
  if (removed.kind === 'retained') {
    await audit.auditRetainedAliasRemoval(userId, { pageId, address: removed.address });
  }

  return { address: removed.address, kind: removed.kind };
}

/**
 * Release every address of a soft-deleted page back to the available pool
 * (FR-014a, US4). Space-manage only, and only for a page that is currently
 * deleted — irreversible: the released addresses are not restored if the
 * page is later restored, unlike an ordinary soft delete.
 */
export async function releaseAddresses(ctx: PermCtx, space: SpaceIdentity, pageId: string): Promise<{ released: number }> {
  const userId = getActorUserId(ctx);
  const released = await db.transaction(async (tx) => {
    const page = await tx.query.pages.findFirst({ where: eq(schema.pages.id, pageId) });
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    if (!can(ctx, 'manage_page_addresses', { kind: 'page', pageId }, pagePermissionOptions(space, page))) {
      throw new DomainError('FORBIDDEN', 'Releasing addresses requires space-manage permission');
    }
    if (!page.deletedAt) {
      throw new DomainError('PAGE_NOT_DELETED', 'The page must be deleted before its addresses can be released');
    }

    const aliasRows = await tx.delete(schema.pageAddresses).where(eq(schema.pageAddresses.pageId, pageId)).returning();
    // The canonical slug column is NOT NULL and still uniqueness-constrained,
    // so it is retired to a page-id-qualified sentinel rather than cleared —
    // guaranteed never to collide with a real address, freeing the original
    // text for reuse (data-model.md's release-addresses write rule).
    await tx
      .update(schema.pages)
      .set({ slug: `released:${page.id}`, updatedAt: new Date() })
      .where(eq(schema.pages.id, pageId));
    return aliasRows.length + 1;
  });

  invalidatePublicContentCache();
  await audit.auditAddressRelease(userId, { pageId });

  return { released };
}
