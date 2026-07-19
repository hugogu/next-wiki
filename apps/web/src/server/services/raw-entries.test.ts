import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildApiKeyCtx, buildUserCtx } from '@/server/permissions';
import * as pageService from '@/server/services/pages';
import * as publicContent from '@/server/services/public-content';
import * as rawEntries from '@/server/services/raw-entries';
import * as rawCategories from '@/server/services/raw-categories';
import * as revisions from '@/server/services/revisions';
import { beginPendingSwitch, clearPendingSwitch, setModeInternal } from '@/server/services/writing-mode';
import { publicPageListQuerySchema } from '@next-wiki/shared';
import { createAdminUser, resetSetupOnboardingState } from '../../../test/setup-onboarding-fixtures';

// A tiny but signature-valid PDF payload (starts with %PDF-).
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');

async function ensureRawSpace() {
  const [space] = await db
    .insert(schema.spaces)
    .values({ slug: 'raw', name: 'Raw', kind: 'raw', anonymousRead: false })
    .onConflictDoNothing()
    .returning();
  return space ?? (await db.query.spaces.findFirst({ where: eq(schema.spaces.slug, 'raw') }))!;
}

async function createUser(email: string, role: 'editor' | 'reader') {
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role, status: 'active' })
    .returning();
  if (!user) throw new Error('Failed to create test user');
  return user;
}

function createRawEntry(
  ctx: ReturnType<typeof buildUserCtx>,
  path = 'raw/evidence',
  content = 'Initial transcript chunk.',
) {
  return rawEntries.createEntry(ctx, {
    path,
    title: 'Evidence',
    inputKind: 'chat-transcript',
    source: { channel: 'support', sessionId: 'session-1', occurredAt: '2026-07-18T08:00:00.000Z' },
    content,
  });
}

describe('raw entries service', () => {
  let adminCtx: ReturnType<typeof buildUserCtx>;
  let adminId: string;

  beforeEach(async () => {
    await resetSetupOnboardingState();
    await ensureRawSpace();
    await setModeInternal('llm-wiki', null);
    const created = await createAdminUser();
    adminId = created.userId;
    adminCtx = buildUserCtx(adminId, 'admin');
    // Every raw entry needs a category; a default lets create omit an explicit id.
    await rawCategories.createCategory(adminCtx, { name: 'Support', slug: 'support', isDefault: true });
  });

  afterAll(async () => {
    await resetSetupOnboardingState();
    await closeDb();
  });

  it('stores the body byte-identical (no OKF frontmatter) with source in metadata', async () => {
    const body = 'Initial transcript chunk.\nSecond line.\n';
    const created = await createRawEntry(adminCtx, 'raw/evidence', body);

    const page = await db.query.pages.findFirst({ where: eq(schema.pages.id, created.pageId) });
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, created.versionId) });

    expect(page).toMatchObject({ path: 'raw/evidence', nature: 'original', visibility: 'restricted' });
    expect(page?.rawCategoryId).toEqual(expect.any(String));
    // Body is preserved verbatim: no `---` frontmatter, no `type:` injection.
    expect(revision?.contentSource).toBe(body);
    expect(revision?.contentSource).not.toContain('type: chat-transcript');
    expect(revision?.contentType).toBe('text/markdown');
    // inputKind + source live in source_metadata, never in the body.
    expect(revision?.sourceMetadata).toMatchObject({
      inputKind: 'chat-transcript', channel: 'support', sessionId: 'session-1',
    });

    const resource = await publicContent.getRevision(adminCtx, created.pageId, 1);
    expect(resource).toMatchObject({
      origin: { actorKind: 'human', nature: 'original' },
      source: { channel: 'support', sessionId: 'session-1' },
      categoryId: page?.rawCategoryId,
    });
    // The internal inputKind key is not leaked into the API `source` object.
    expect(resource?.source).not.toHaveProperty('inputKind');
  });

  it('stores original bytes via content_assets referenced by original_asset_id', async () => {
    const created = await rawEntries.createEntry(adminCtx, {
      path: 'raw/report',
      title: 'Report',
      inputKind: 'external-fetch',
      content: 'Extracted text of the report.',
      contentType: 'application/pdf',
      originalBytes: PDF_BYTES.toString('base64'),
    });
    const revision = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, created.versionId) });
    expect(revision?.contentType).toBe('application/pdf');
    expect(revision?.contentSource).toBe('Extracted text of the report.');
    expect(revision?.originalAssetId).toEqual(expect.any(String));

    const asset = await db.query.contentAssets.findFirst({ where: eq(schema.contentAssets.id, revision!.originalAssetId!) });
    expect(asset).toMatchObject({ kind: 'raw', contentType: 'application/pdf', sizeBytes: PDF_BYTES.length });

    const resource = await publicContent.getRevision(adminCtx, created.pageId, 1);
    expect(resource?.originalAsset).toMatchObject({ id: revision?.originalAssetId, contentType: 'application/pdf' });
  });

  it('rejects a declared content type that disagrees with the uploaded bytes', async () => {
    await expect(
      rawEntries.createEntry(adminCtx, {
        path: 'raw/mismatch', title: 'Mismatch', inputKind: 'external-fetch',
        content: 'text', contentType: 'text/plain', originalBytes: PDF_BYTES.toString('base64'),
      }),
    ).rejects.toMatchObject({ code: 'RAW_CONTENT_TYPE_MISMATCH' });
  });

  it('requires a category when no default is configured', async () => {
    // Retire the default so no default remains.
    const [cat] = await db.select().from(schema.rawCategories);
    await rawCategories.retireCategory(adminCtx, cat!.id);
    await expect(createRawEntry(adminCtx, 'raw/no-cat')).rejects.toMatchObject({ code: 'RAW_CATEGORY_REQUIRED' });
  });

  it('rejects a retired explicit category', async () => {
    const cat = await rawCategories.createCategory(adminCtx, { name: 'Legacy', slug: 'legacy' });
    await rawCategories.retireCategory(adminCtx, cat.id);
    await expect(
      rawEntries.createEntry(adminCtx, {
        path: 'raw/retired', title: 'R', inputKind: 'manual-note', content: 'x', categoryId: cat.id,
      }),
    ).rejects.toMatchObject({ code: 'RAW_CATEGORY_RETIRED' });
  });

  it('appends a new published revision, preserving prior bytes and attaching a new asset', async () => {
    const created = await createRawEntry(adminCtx, 'raw/evidence', 'Initial transcript chunk.\n');
    const initial = await db.query.pageRevisions.findFirst({ where: eq(schema.pageRevisions.id, created.versionId) });
    if (!initial?.contentSource) throw new Error('Missing initial raw source');

    const appended = await rawEntries.appendEntry(adminCtx, created.pageId, {
      content: 'Follow-up chunk.',
      source: { channel: 'support', sessionId: 'session-1', occurredAt: '2026-07-18T09:00:00.000Z' },
      contentType: 'application/pdf',
      originalBytes: PDF_BYTES.toString('base64'),
    });
    const rows = await db
      .select()
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId))
      .orderBy(asc(schema.pageRevisions.versionNumber));

    expect(appended.versionNumber).toBe(2);
    // Version 1 bytes are untouched.
    expect(rows[0]?.contentSource).toBe(initial.contentSource);
    expect(rows[1]?.contentSource).toBe(`${initial.contentSource}\n\n---\n\nFollow-up chunk.`);
    expect(rows[1]?.originalAssetId).toEqual(expect.any(String));
    expect(rows[1]?.originalAssetId).not.toBe(rows[0]?.originalAssetId);
  });

  it('serializes concurrent appends into sequential versions', async () => {
    const created = await createRawEntry(adminCtx);
    const [first, second] = await Promise.all([
      rawEntries.appendEntry(adminCtx, created.pageId, { content: 'Concurrent chunk A.' }),
      rawEntries.appendEntry(adminCtx, created.pageId, { content: 'Concurrent chunk B.' }),
    ]);
    const rows = await db
      .select()
      .from(schema.pageRevisions)
      .where(eq(schema.pageRevisions.pageId, created.pageId))
      .orderBy(asc(schema.pageRevisions.versionNumber));

    expect(new Set([first.versionNumber, second.versionNumber])).toEqual(new Set([2, 3]));
    expect(rows.map((row) => row.versionNumber)).toEqual([1, 2, 3]);
    expect(rows[2]?.contentSource).toContain('Concurrent chunk A.');
    expect(rows[2]?.contentSource).toContain('Concurrent chunk B.');
  });

  it('rejects every regular mutation path for raw entries', async () => {
    const created = await createRawEntry(adminCtx);
    await expect(pageService.newDraft(adminCtx, 'raw/evidence', { title: 'Changed', contentSource: 'Changed' }, 'raw')).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(pageService.updateProperties(adminCtx, 'raw/evidence', { path: 'raw/renamed' }, 'raw')).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(pageService.remove(adminCtx, 'raw/evidence', 'raw')).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(revisions.publish(adminCtx, { path: 'raw/evidence', version: 1, space: 'raw' })).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
    await expect(publicContent.updatePageMetadata(adminCtx, created.pageId, { baseRevisionId: created.versionId, title: 'Changed' })).rejects.toMatchObject({ code: 'RAW_SPACE_IMMUTABLE' });
  });

  it('denies non-admin API keys while allowing an admin-backed key', async () => {
    const editor = await createUser('raw-editor@example.com', 'editor');
    const reader = await createUser('raw-reader@example.com', 'reader');
    const input = { path: 'raw/api-key', title: 'API Key', inputKind: 'manual-note', content: 'A note.' };

    await expect(rawEntries.createEntry(buildApiKeyCtx(editor.id, 'editor', ['create'], 'editor-key'), input)).rejects.toMatchObject({ code: 'SPACE_FORBIDDEN' });
    await expect(rawEntries.createEntry(buildApiKeyCtx(reader.id, 'reader', ['create'], 'reader-key'), input)).rejects.toMatchObject({ code: 'SPACE_FORBIDDEN' });
    await expect(rawEntries.createEntry(buildApiKeyCtx(adminId, 'admin', ['create'], 'admin-key'), input)).resolves.toMatchObject({ pageId: expect.any(String) });
  });

  it('filters raw listings by inputKind and categoryId independently from filterType', async () => {
    const ops = await rawCategories.createCategory(adminCtx, { name: 'Ops', slug: 'ops' });
    await rawEntries.createEntry(adminCtx, {
      path: 'raw/chat', title: 'Chat', inputKind: 'chat-transcript', content: 'chat evidence',
    });
    await rawEntries.createEntry(adminCtx, {
      path: 'raw/script', title: 'Script', inputKind: 'script-run', content: 'script output', categoryId: ops.id,
    });

    const list = (params: Record<string, unknown>) =>
      publicContent.listPages(adminCtx, publicPageListQuerySchema.parse({ space: 'raw', ...params }));

    const byKind = await list({ filterInputKind: 'script-run' });
    expect(byKind.items.map((p) => p.path)).toEqual(['raw/script']);

    const byCategory = await list({ filterCategoryId: ops.id });
    expect(byCategory.items.map((p) => p.path)).toEqual(['raw/script']);

    // filterType (frontmatter type) is a separate dimension: raw bodies carry no
    // frontmatter, so filtering by it returns nothing rather than matching inputKind.
    const byType = await list({ filterType: 'script-run' });
    expect(byType.items).toHaveLength(0);
  });

  it('rejects raw writes outside LLM Wiki mode and while a switch is pending', async () => {
    await setModeInternal('copilot', adminId);
    await expect(createRawEntry(adminCtx, 'raw/copilot')).rejects.toMatchObject({ code: 'SPACE_UNAVAILABLE' });

    await setModeInternal('llm-wiki', adminId);
    await beginPendingSwitch('copilot', randomUUID(), adminId);
    await expect(createRawEntry(adminCtx, 'raw/pending')).rejects.toMatchObject({ code: 'MODE_SWITCH_IN_PROGRESS' });
    await clearPendingSwitch(adminId);
  });
});
