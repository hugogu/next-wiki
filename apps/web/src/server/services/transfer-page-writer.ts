import { randomUUID } from 'node:crypto';
import { and, eq, inArray, max } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { renderMarkdown } from '@/server/pipeline';
import { syncRevisionAssetRefs } from './content-assets';
import { addReplicationTasks, kickReplication } from './storage-replication';
import { reconcilePageAcrossIndexes } from './ai-index';
import { buildUserCtx } from '@/server/permissions';
import { persistRevisionMetadata } from './page-metadata';
import { resolveSpace } from '@/server/services/spaces';
import { assertNoSwitchInProgress } from '@/server/services/writing-mode';
import { ensureOkfConformance } from '@/server/services/okf';
import { deriveImportAddress, type ImportAddressAdjustmentReason } from '@/server/services/page-addresses';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 035 (US5/FR-025/FR-026): the address a newly created imported page gets.
 * Never called for an existing page — FR-026 forbids altering the address of
 * a page that already holds one. Queries this space's current addresses
 * once per call rather than per candidate suffix, since Wiki.js imports run
 * one page per transaction, sequentially — each call already sees every
 * page committed by an earlier one in the same run.
 */
async function deriveNewPageAddress(
  tx: Tx,
  spaceId: string,
  sourcePath: string,
): Promise<{ address: string; reason: ImportAddressAdjustmentReason | null }> {
  const [slugRows, aliasRows] = await Promise.all([
    tx.query.pages.findMany({ where: eq(schema.pages.spaceId, spaceId), columns: { slug: true } }),
    tx.query.pageAddresses.findMany({ where: eq(schema.pageAddresses.spaceId, spaceId), columns: { address: true } }),
  ]);
  const taken = new Set([...slugRows.map((r) => r.slug), ...aliasRows.map((r) => r.address)]);
  return deriveImportAddress(sourcePath, (address) => taken.has(address));
}

export async function writeImportedRawEntry(input: {
  actorUserId: string;
  page: {
    path: string;
    locale: string;
    title: string;
    body: string;
    contentType: string;
    inputKind?: 'chat-transcript' | 'external-fetch' | 'script-run' | 'manual-note' | null;
    rawSource?: Record<string, unknown> | null;
    originalAssetId?: string | null;
  };
  action: 'create' | 'replace' | 'skip';
}): Promise<{ pageId: string | null; revisionId: string | null; action: typeof input.action }> {
  const space = await resolveSpace('raw');
  if (!space || space.kind !== 'raw') throw new Error('Raw space not found');
  const existing = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, input.page.path),
      eq(schema.pages.locale, input.page.locale),
    ),
  });
  if (existing && input.action === 'skip') return { pageId: existing.id, revisionId: null, action: 'skip' };
  if (existing && !existing.deletedAt && input.action === 'create') {
    return { pageId: existing.id, revisionId: null, action: 'skip' };
  }
  const revisionId = randomUUID();
  const contentSource = input.page.body;
  const { html, hash } = renderMarkdown(contentSource);
  const contentType = input.page.contentType || 'text/plain';
  const sourceMetadata: Record<string, unknown> = {};
  if (input.page.inputKind) sourceMetadata.inputKind = input.page.inputKind;
  if (input.page.rawSource) Object.assign(sourceMetadata, input.page.rawSource);
  // Resolve the default category before the transaction so the tx can pass a
  // plain category-id; transactions don't share the db query type.
  const defaultCategory = await db.query.rawCategories.findFirst({
    where: and(
      eq(schema.rawCategories.isDefault, true),
      eq(schema.rawCategories.isRetired, false),
    ),
  });
  if (!defaultCategory) throw new Error('No default raw category is configured — cannot import raw entries');

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    const categoryId = defaultCategory.id;
    let pageId: string;
    let versionNumber = 1;
    if (existing) {
      const versions = await tx
        .select({ value: max(schema.pageRevisions.versionNumber) })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      versionNumber = (versions[0]?.value ?? 0) + 1;
      pageId = existing.id;
    } else {
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: space.id,
          // 035 (FR-025): default address is the full source path; conflict
          // and invalid-character resolution (deriveImportAddress) lands in
          // US5.
          slug: input.page.path,
          path: input.page.path,
          locale: input.page.locale,
          title: input.page.title,
          authorId: input.actorUserId,
          nature: 'original',
          visibility: 'restricted',
          rawCategoryId: categoryId,
        })
        .returning({ id: schema.pages.id });
      pageId = page!.id;
    }
    await tx.insert(schema.pageRevisions).values({
      id: revisionId,
      pageId,
      versionNumber,
      contentType,
      contentSource,
      contentHtml: html,
      contentHash: hash,
      authorId: input.actorUserId,
      status: 'published',
      publishedAt: new Date(),
      actorKind: 'machine',
      sourceMetadata,
      originalAssetId: input.page.originalAssetId ?? null,
    });
    await syncRevisionAssetRefs(tx, revisionId, contentSource);
    await addReplicationTasks(tx, 'markdown', revisionId, hash);
    await tx
      .update(schema.pages)
      .set({
        currentPublishedVersionId: revisionId,
        latestVersionId: revisionId,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, pageId));
    return { pageId };
  });
  await kickReplication();
  await reconcilePageAcrossIndexes(result.pageId, buildUserCtx(input.actorUserId, 'admin'));
  return {
    pageId: result.pageId,
    revisionId,
    action: existing && input.action !== 'replace' ? 'replace' : 'create',
  };
}

export async function writeImportedGeneratedPage(input: {
  actorUserId: string;
  page: {
    path: string;
    locale: string;
    title: string;
    body: string;
  };
  action: 'create' | 'replace' | 'skip';
}): Promise<{ pageId: string | null; revisionId: string | null; action: typeof input.action }> {
  const space = await resolveSpace('generated');
  if (!space || space.kind !== 'generated') throw new Error('Generated space not found');
  const existing = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, input.page.path),
      eq(schema.pages.locale, input.page.locale),
    ),
  });
  if (existing && input.action === 'skip') return { pageId: existing.id, revisionId: null, action: 'skip' };
  if (existing && !existing.deletedAt && input.action === 'create') {
    return { pageId: existing.id, revisionId: null, action: 'skip' };
  }
  const revisionId = randomUUID();
  const now = new Date();
  const contentSource = ensureOkfConformance(input.page.body, {
    title: input.page.title,
    now,
  });
  const { html, hash } = renderMarkdown(contentSource);

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);
    let pageId: string;
    let versionNumber = 1;
    if (existing) {
      const versions = await tx
        .select({ value: max(schema.pageRevisions.versionNumber) })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      versionNumber = (versions[0]?.value ?? 0) + 1;
      pageId = existing.id;
    } else {
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: space.id,
          // 035 (FR-025): default address is the full source path; conflict
          // and invalid-character resolution (deriveImportAddress) lands in
          // US5.
          slug: input.page.path,
          path: input.page.path,
          locale: input.page.locale,
          title: input.page.title,
          authorId: input.actorUserId,
          nature: 'generated',
        })
        .returning({ id: schema.pages.id });
      pageId = page!.id;
    }
    await tx.insert(schema.pageRevisions).values({
      id: revisionId,
      pageId,
      versionNumber,
      contentType: 'text/markdown',
      contentSource,
      contentHtml: html,
      contentHash: hash,
      authorId: input.actorUserId,
      status: 'published',
      publishedAt: now,
      actorKind: 'machine',
    });
    const metadata = await persistRevisionMetadata(tx, {
      revisionId,
      spaceId: space.id,
      source: contentSource,
      fallbackTitle: input.page.title,
    });
    await syncRevisionAssetRefs(tx, revisionId, contentSource);
    await addReplicationTasks(tx, 'markdown', revisionId, hash);
    await tx
      .update(schema.pages)
      .set({
        title: metadata.title,
        currentPublishedVersionId: revisionId,
        latestVersionId: revisionId,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, pageId));
    return { pageId };
  });
  await kickReplication();
  await reconcilePageAcrossIndexes(result.pageId, buildUserCtx(input.actorUserId, 'admin'));
  return {
    pageId: result.pageId,
    revisionId,
    action: existing && input.action !== 'replace' ? 'replace' : 'create',
  };
}

export async function writeImportedPage(input: {
  actorUserId: string;
  path: string;
  locale: string;
  title: string;
  markdown: string;
  action: 'create' | 'replace' | 'skip';
}): Promise<{
  pageId: string | null;
  revisionId: string | null;
  action: typeof input.action;
  address?: string;
  addressAdjustmentReason?: ImportAddressAdjustmentReason | null;
}> {
  const space = await resolveSpace();
  if (!space) throw new Error('Default space not found');
  // Match the database uniqueness contract exactly. The canonical page key is
  // (space_id, path, locale), and the unique index also includes soft-deleted
  // rows. Import must therefore reuse a soft-deleted row and restore it instead
  // of trying to insert a second row for the same canonical key.
  const existing = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, input.path),
      eq(schema.pages.locale, input.locale),
    ),
  });
  if (existing && input.action === 'skip') return { pageId: existing.id, revisionId: null, action: 'skip' };
  if (existing && !existing.deletedAt && input.action === 'create') {
    return { pageId: existing.id, revisionId: null, action: 'skip' };
  }

  const revisionId = randomUUID();
  const { html, hash } = renderMarkdown(input.markdown);
  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    let pageId: string;
    let versionNumber = 1;
    let restoredDeletedPage = false;
    let derivedAddress: { address: string; reason: ImportAddressAdjustmentReason | null } | null = null;
    if (existing) {
      const versions = await tx
        .select({ value: max(schema.pageRevisions.versionNumber) })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      versionNumber = (versions[0]?.value ?? 0) + 1;
      pageId = existing.id;
      restoredDeletedPage = Boolean(existing.deletedAt);
    } else {
      // 035 (FR-025/FR-026): default address is the Wiki.js source path,
      // adjusted only when it collides or is otherwise unusable — never
      // touching whatever page already holds a candidate.
      derivedAddress = await deriveNewPageAddress(tx, space.id, input.path);
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: space.id,
          slug: derivedAddress.address,
          path: input.path,
          locale: input.locale,
          title: input.title,
          authorId: input.actorUserId,
          nature: 'original',
        })
        .returning({ id: schema.pages.id });
      pageId = page!.id;
    }
    await tx.insert(schema.pageRevisions).values({
      id: revisionId,
      pageId,
      versionNumber,
      locale: input.locale,
      contentType: 'text/markdown',
      contentSource: input.markdown,
      contentHtml: html,
      contentHash: hash,
      authorId: input.actorUserId,
      status: 'published',
      publishedAt: new Date(),
      actorKind: 'machine',
    });
    const metadata = await persistRevisionMetadata(tx, {
      revisionId,
      spaceId: space.id,
      source: input.markdown,
      fallbackTitle: input.title,
    });
    await syncRevisionAssetRefs(tx, revisionId, input.markdown);
    await addReplicationTasks(tx, 'markdown', revisionId, hash);
    await tx
      .update(schema.pages)
      .set({
        title: metadata.title,
        currentPublishedVersionId: revisionId,
        latestVersionId: revisionId,
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, pageId));
    return { pageId, restoredDeletedPage, derivedAddress };
  });
  await kickReplication();
  await reconcilePageAcrossIndexes(result.pageId, buildUserCtx(input.actorUserId, 'admin'));
  return {
    pageId: result.pageId,
    revisionId,
    action: existing && !(result.restoredDeletedPage && input.action === 'create') ? 'replace' : 'create',
    address: result.derivedAddress?.address,
    addressAdjustmentReason: result.derivedAddress?.reason,
  };
}

/**
 * Import a page's full Wiki.js revision trail as a coherent, connected
 * next-wiki page history instead of a single overwrite revision. When the
 * page already exists, its current revisions are wiped and replaced end to
 * end — a "full re-import" as agreed with the product owner — because the
 * existing revision sequence has no way to represent Wiki.js version numbers
 * it never saw. `versions` must be ordered oldest to newest; the last entry
 * becomes the page's current published version.
 */
export async function writeImportedPageWithHistory(input: {
  actorUserId: string;
  path: string;
  locale: string;
  versions: Array<{
    markdown: string;
    title: string;
    createdAt: Date;
    sourceMetadata: Record<string, unknown>;
  }>;
  action: 'create' | 'replace' | 'skip';
}): Promise<{
  pageId: string | null;
  revisionIds: string[];
  action: 'create' | 'replace' | 'skip';
  address?: string;
  addressAdjustmentReason?: ImportAddressAdjustmentReason | null;
}> {
  const space = await resolveSpace();
  if (!space) throw new Error('Default space not found');
  const existing = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, input.path),
      eq(schema.pages.locale, input.locale),
    ),
  });
  if (input.action === 'skip') return { pageId: existing?.id ?? null, revisionIds: [], action: 'skip' };
  if (existing && !existing.deletedAt && input.action === 'create') {
    return { pageId: existing.id, revisionIds: [], action: 'skip' };
  }
  if (input.versions.length === 0) {
    throw new Error('writeImportedPageWithHistory requires at least one version');
  }
  // Mirrors writeImportedPage: restoring a soft-deleted page on action:'create'
  // is reported as 'create', not 'replace' — it's not overwriting live content.
  const restoredDeletedPage = Boolean(existing?.deletedAt);

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    let pageId: string;
    let derivedAddress: { address: string; reason: ImportAddressAdjustmentReason | null } | null = null;
    if (existing) {
      // Full re-import: wipe this page's existing revision sequence before
      // rebuilding it from the Wiki.js trail. Order matters:
      const oldRevisions = await tx
        .select({ id: schema.pageRevisions.id })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      const oldRevisionIds = oldRevisions.map((row) => row.id);
      // 1. aiPageIndexStates.targetRevisionId has no onDelete cascade/set null
      //    (plain FK) — deleting pageRevisions first would violate it. The
      //    reconcile call below rebuilds these rows against the new revision
      //    anyway, so it's safe to just drop the page's stale state.
      await tx.delete(schema.aiPageIndexStates).where(eq(schema.aiPageIndexStates.pageId, existing.id));
      if (oldRevisionIds.length > 0) {
        // 2. storageReplicationTasks.objectId is a polymorphic reference with
        //    no real FK, so it is never cleaned up by cascade; leaving it
        //    would make the replication worker retry against revision ids
        //    that no longer exist.
        await tx.delete(schema.storageReplicationTasks).where(
          and(
            eq(schema.storageReplicationTasks.objectKind, 'markdown'),
            inArray(schema.storageReplicationTasks.objectId, oldRevisionIds),
          ),
        );
      }
      // 3. Detach the page's revision pointers before deleting the rows they
      //    reference, so there is never a moment where they dangle.
      await tx
        .update(schema.pages)
        .set({ currentPublishedVersionId: null, latestVersionId: null })
        .where(eq(schema.pages.id, existing.id));
      // 4. pageRevisionMetadata/pageRevisionTags/contentAssetRefs/
      //    aiKnowledgeChunks cascade; translation-related FKs set null.
      await tx.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, existing.id));
      pageId = existing.id;
    } else {
      derivedAddress = await deriveNewPageAddress(tx, space.id, input.path);
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: space.id,
          slug: derivedAddress.address,
          path: input.path,
          locale: input.locale,
          title: input.versions.at(-1)!.title,
          authorId: input.actorUserId,
          nature: 'original',
        })
        .returning({ id: schema.pages.id });
      pageId = page!.id;
    }

    // Insert the full trail strictly in order — versionNumber is a per-page
    // running counter, so concurrent inserts for the same page would race.
    let versionNumber = 1;
    const revisionIds: string[] = [];
    let finalTitle = input.versions.at(-1)!.title;
    for (const version of input.versions) {
      const revisionId = randomUUID();
      const { html, hash } = renderMarkdown(version.markdown);
      await tx.insert(schema.pageRevisions).values({
        id: revisionId,
        pageId,
        versionNumber: versionNumber++,
        locale: input.locale,
        contentType: 'text/markdown',
        contentSource: version.markdown,
        contentHtml: html,
        contentHash: hash,
        authorId: input.actorUserId,
        // Every imported version is 'published', not just the latest one:
        // getHistory() hides draft revisions from non-admin readers, and a
        // Wiki.js trail entry is by definition a version that was once live.
        status: 'published',
        publishedAt: version.createdAt,
        createdAt: version.createdAt,
        actorKind: 'machine',
        sourceMetadata: version.sourceMetadata,
      });
      const metadata = await persistRevisionMetadata(tx, {
        revisionId,
        spaceId: space.id,
        source: version.markdown,
        fallbackTitle: version.title,
      });
      await syncRevisionAssetRefs(tx, revisionId, version.markdown);
      await addReplicationTasks(tx, 'markdown', revisionId, hash);
      revisionIds.push(revisionId);
      finalTitle = metadata.title;
    }

    await tx
      .update(schema.pages)
      .set({
        title: finalTitle,
        currentPublishedVersionId: revisionIds.at(-1),
        latestVersionId: revisionIds.at(-1),
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, pageId));

    return { pageId, revisionIds, derivedAddress };
  });

  // Per-page reconcile/replication kick, not per-revision: both only care
  // about the page's final currentPublishedVersionId, so calling them once
  // after the whole trail is written avoids redundant work (see ai-index.ts).
  await kickReplication();
  await reconcilePageAcrossIndexes(result.pageId, buildUserCtx(input.actorUserId, 'admin'));
  return {
    pageId: result.pageId,
    revisionIds: result.revisionIds,
    action: existing && !(restoredDeletedPage && input.action === 'create') ? 'replace' : 'create',
    address: result.derivedAddress?.address,
    addressAdjustmentReason: result.derivedAddress?.reason,
  };
}

/** Same "wipe and rebuild the revision sequence" semantics as
 * writeImportedPageWithHistory, adapted for raw entries: no persistRevisionMetadata
 * (raw pages have no per-revision title — see writeImportedRawEntry), each version
 * keeps its own declared contentType/originalAssetId, and an existing page's
 * rawCategoryId is left untouched (category only applies on first creation). */
export async function writeImportedRawEntryWithHistory(input: {
  actorUserId: string;
  path: string;
  locale: string;
  title: string;
  versions: Array<{
    body: string;
    contentType: string;
    createdAt: Date;
    sourceMetadata: Record<string, unknown>;
    originalAssetId?: string | null;
  }>;
  action: 'create' | 'replace' | 'skip';
}): Promise<{ pageId: string | null; revisionIds: string[]; action: 'create' | 'replace' | 'skip' }> {
  const space = await resolveSpace('raw');
  if (!space || space.kind !== 'raw') throw new Error('Raw space not found');
  const existing = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, input.path),
      eq(schema.pages.locale, input.locale),
    ),
  });
  if (input.action === 'skip') return { pageId: existing?.id ?? null, revisionIds: [], action: 'skip' };
  if (existing && !existing.deletedAt && input.action === 'create') {
    return { pageId: existing.id, revisionIds: [], action: 'skip' };
  }
  if (input.versions.length === 0) {
    throw new Error('writeImportedRawEntryWithHistory requires at least one version');
  }
  const restoredDeletedPage = Boolean(existing?.deletedAt);

  const defaultCategory = existing
    ? null
    : await db.query.rawCategories.findFirst({
        where: and(eq(schema.rawCategories.isDefault, true), eq(schema.rawCategories.isRetired, false)),
      });
  if (!existing && !defaultCategory) {
    throw new Error('No default raw category is configured — cannot import raw entries');
  }

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    let pageId: string;
    if (existing) {
      const oldRevisions = await tx
        .select({ id: schema.pageRevisions.id })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      const oldRevisionIds = oldRevisions.map((row) => row.id);
      await tx.delete(schema.aiPageIndexStates).where(eq(schema.aiPageIndexStates.pageId, existing.id));
      if (oldRevisionIds.length > 0) {
        await tx.delete(schema.storageReplicationTasks).where(
          and(
            eq(schema.storageReplicationTasks.objectKind, 'markdown'),
            inArray(schema.storageReplicationTasks.objectId, oldRevisionIds),
          ),
        );
      }
      await tx
        .update(schema.pages)
        .set({ currentPublishedVersionId: null, latestVersionId: null })
        .where(eq(schema.pages.id, existing.id));
      await tx.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, existing.id));
      pageId = existing.id;
    } else {
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: space.id,
          // 035 (FR-025/FR-026): default address is the full path; conflict
          // and invalid-character resolution (deriveImportAddress) lands in
          // US5.
          slug: input.path,
          path: input.path,
          locale: input.locale,
          title: input.title,
          authorId: input.actorUserId,
          nature: 'original',
          visibility: 'restricted',
          rawCategoryId: defaultCategory!.id,
        })
        .returning({ id: schema.pages.id });
      pageId = page!.id;
    }

    let versionNumber = 1;
    const revisionIds: string[] = [];
    for (const version of input.versions) {
      const revisionId = randomUUID();
      const { html, hash } = renderMarkdown(version.body);
      await tx.insert(schema.pageRevisions).values({
        id: revisionId,
        pageId,
        versionNumber: versionNumber++,
        contentType: version.contentType || 'text/plain',
        contentSource: version.body,
        contentHtml: html,
        contentHash: hash,
        authorId: input.actorUserId,
        status: 'published',
        publishedAt: version.createdAt,
        createdAt: version.createdAt,
        actorKind: 'machine',
        sourceMetadata: version.sourceMetadata,
        originalAssetId: version.originalAssetId ?? null,
      });
      await syncRevisionAssetRefs(tx, revisionId, version.body);
      await addReplicationTasks(tx, 'markdown', revisionId, hash);
      revisionIds.push(revisionId);
    }

    await tx
      .update(schema.pages)
      .set({
        currentPublishedVersionId: revisionIds.at(-1),
        latestVersionId: revisionIds.at(-1),
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, pageId));

    return { pageId, revisionIds };
  });

  await kickReplication();
  await reconcilePageAcrossIndexes(result.pageId, buildUserCtx(input.actorUserId, 'admin'));
  return {
    pageId: result.pageId,
    revisionIds: result.revisionIds,
    action: existing && !(restoredDeletedPage && input.action === 'create') ? 'replace' : 'create',
  };
}

/** Same "wipe and rebuild the revision sequence" semantics as
 * writeImportedPageWithHistory, adapted for generated pages: every version runs
 * through ensureOkfConformance and gets its own persistRevisionMetadata row,
 * matching writeImportedGeneratedPage's per-write normalization. */
export async function writeImportedGeneratedPageWithHistory(input: {
  actorUserId: string;
  path: string;
  locale: string;
  versions: Array<{
    markdown: string;
    title: string;
    createdAt: Date;
  }>;
  action: 'create' | 'replace' | 'skip';
}): Promise<{ pageId: string | null; revisionIds: string[]; action: 'create' | 'replace' | 'skip' }> {
  const space = await resolveSpace('generated');
  if (!space || space.kind !== 'generated') throw new Error('Generated space not found');
  const existing = await db.query.pages.findFirst({
    where: and(
      eq(schema.pages.spaceId, space.id),
      eq(schema.pages.path, input.path),
      eq(schema.pages.locale, input.locale),
    ),
  });
  if (input.action === 'skip') return { pageId: existing?.id ?? null, revisionIds: [], action: 'skip' };
  if (existing && !existing.deletedAt && input.action === 'create') {
    return { pageId: existing.id, revisionIds: [], action: 'skip' };
  }
  if (input.versions.length === 0) {
    throw new Error('writeImportedGeneratedPageWithHistory requires at least one version');
  }
  const restoredDeletedPage = Boolean(existing?.deletedAt);

  const result = await db.transaction(async (tx) => {
    await assertNoSwitchInProgress(tx);

    let pageId: string;
    if (existing) {
      const oldRevisions = await tx
        .select({ id: schema.pageRevisions.id })
        .from(schema.pageRevisions)
        .where(eq(schema.pageRevisions.pageId, existing.id));
      const oldRevisionIds = oldRevisions.map((row) => row.id);
      await tx.delete(schema.aiPageIndexStates).where(eq(schema.aiPageIndexStates.pageId, existing.id));
      if (oldRevisionIds.length > 0) {
        await tx.delete(schema.storageReplicationTasks).where(
          and(
            eq(schema.storageReplicationTasks.objectKind, 'markdown'),
            inArray(schema.storageReplicationTasks.objectId, oldRevisionIds),
          ),
        );
      }
      await tx
        .update(schema.pages)
        .set({ currentPublishedVersionId: null, latestVersionId: null })
        .where(eq(schema.pages.id, existing.id));
      await tx.delete(schema.pageRevisions).where(eq(schema.pageRevisions.pageId, existing.id));
      pageId = existing.id;
    } else {
      const [page] = await tx
        .insert(schema.pages)
        .values({
          spaceId: space.id,
          // 035 (FR-025/FR-026): default address is the full path; conflict
          // and invalid-character resolution (deriveImportAddress) lands in
          // US5.
          slug: input.path,
          path: input.path,
          locale: input.locale,
          title: input.versions.at(-1)!.title,
          authorId: input.actorUserId,
          nature: 'generated',
        })
        .returning({ id: schema.pages.id });
      pageId = page!.id;
    }

    let versionNumber = 1;
    const revisionIds: string[] = [];
    let finalTitle = input.versions.at(-1)!.title;
    for (const version of input.versions) {
      const revisionId = randomUUID();
      const contentSource = ensureOkfConformance(version.markdown, {
        title: version.title,
        now: version.createdAt,
      });
      const { html, hash } = renderMarkdown(contentSource);
      await tx.insert(schema.pageRevisions).values({
        id: revisionId,
        pageId,
        versionNumber: versionNumber++,
        contentType: 'text/markdown',
        contentSource,
        contentHtml: html,
        contentHash: hash,
        authorId: input.actorUserId,
        status: 'published',
        publishedAt: version.createdAt,
        createdAt: version.createdAt,
        actorKind: 'machine',
      });
      const metadata = await persistRevisionMetadata(tx, {
        revisionId,
        spaceId: space.id,
        source: contentSource,
        fallbackTitle: version.title,
      });
      await syncRevisionAssetRefs(tx, revisionId, contentSource);
      await addReplicationTasks(tx, 'markdown', revisionId, hash);
      revisionIds.push(revisionId);
      finalTitle = metadata.title;
    }

    await tx
      .update(schema.pages)
      .set({
        title: finalTitle,
        currentPublishedVersionId: revisionIds.at(-1),
        latestVersionId: revisionIds.at(-1),
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.pages.id, pageId));

    return { pageId, revisionIds };
  });

  await kickReplication();
  await reconcilePageAcrossIndexes(result.pageId, buildUserCtx(input.actorUserId, 'admin'));
  return {
    pageId: result.pageId,
    revisionIds: result.revisionIds,
    action: existing && !(restoredDeletedPage && input.action === 'create') ? 'replace' : 'create',
  };
}
