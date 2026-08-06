import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx, type PermCtx } from '@/server/permissions';
import * as pageAttachments from '@/server/services/page-attachments';

const PDF = Buffer.from('%PDF-1.4\nfake pdf body for tests\n');

let spaceId: string;
let editorId: string; // author of the test page
let readerId: string;
let pageId: string;

const editorCtx = (): PermCtx => buildUserCtx(editorId, 'editor');
const readerCtx = (): PermCtx => buildUserCtx(readerId, 'reader');

async function cleanup() {
  await db.delete(schema.pageAttachments);
  await db.delete(schema.contentBlobs);
  await db.delete(schema.contentAssets);
  await db.delete(schema.pages);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  const [space] = await db.insert(schema.spaces).values({ slug: 'default', name: 'Default' }).returning();
  spaceId = space!.id;
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'perm-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  editorId = editor!.id;
  const [reader] = await db
    .insert(schema.users)
    .values({ email: 'perm-reader@example.com', passwordHash: 'HASH', role: 'reader' })
    .returning();
  readerId = reader!.id;
});

afterAll(async () => {
  await cleanup();
  await db.delete(schema.users);
  await db.delete(schema.spaces);
  await closeDb();
});

beforeEach(async () => {
  await cleanup();
  // Not published, so read/read_draft for a non-author, non-admin credential
  // is false — exercising the FR-007a "must also be able to read the page"
  // gate deliberately, rather than relying on public readability.
  const [page] = await db
    .insert(schema.pages)
    .values({ spaceId, slug: 's', path: `o/${randomUUID()}`, title: 'T', authorId: editorId })
    .returning();
  pageId = page!.id;
});

describe('canAttach — session users (US1)', () => {
  it('lets the author/editor attach', async () => {
    const result = await pageAttachments.attachFile(editorCtx(), pageId, PDF, 'a.pdf');
    expect(result.fileName).toBe('a.pdf');
  });

  it('refuses a reader session', async () => {
    await expect(pageAttachments.attachFile(readerCtx(), pageId, PDF, 'a.pdf')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('canAttach — API key credentials (FR-007/FR-007a)', () => {
  it('refuses an API key with edit+create scopes but no attachments scope', async () => {
    const ctx = buildApiKeyCtx(editorId, 'editor', ['edit', 'create'], 'key-1');
    await expect(pageAttachments.attachFile(ctx, pageId, PDF, 'a.pdf')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('succeeds for an API key with the attachments scope plus enough read scope to see this page', async () => {
    // FR-007a requires read access on top of the attachments scope; per the
    // existing scope ∩ role model that read access must itself be granted
    // by a scope (here `view`), not implied by being the page's author.
    const ctx = buildApiKeyCtx(editorId, 'editor', ['attachments', 'view'], 'key-2');
    const result = await pageAttachments.attachFile(ctx, pageId, PDF, 'a.pdf');
    expect(result.fileName).toBe('a.pdf');
  });

  it('refuses an API key with the attachments scope and the page author as owner, but no read-granting scope (view/edit/create)', async () => {
    // Authorship alone does not substitute for a read-granting scope on an
    // API key — scope ∩ role applies uniformly, with no author exception.
    const ctx = buildApiKeyCtx(editorId, 'editor', ['attachments'], 'key-2b');
    await expect(pageAttachments.attachFile(ctx, pageId, PDF, 'a.pdf')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses an API key with the attachments scope but no read access to this page (FR-007a)', async () => {
    // A different, non-author editor: has the attachments scope and would
    // pass the role check, but cannot read this unpublished page.
    const [otherEditor] = await db
      .insert(schema.users)
      .values({ email: `perm-other-${randomUUID()}@example.com`, passwordHash: 'HASH', role: 'editor' })
      .returning();
    const ctx = buildApiKeyCtx(otherEditor!.id, 'editor', ['attachments'], 'key-3');
    await expect(pageAttachments.attachFile(ctx, pageId, PDF, 'a.pdf')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses an admin-owned API key without the attachments scope, even though the admin role could otherwise read/edit anything', async () => {
    const [admin] = await db
      .insert(schema.users)
      .values({ email: `perm-admin-${randomUUID()}@example.com`, passwordHash: 'HASH', role: 'admin' })
      .returning();
    const ctx = buildApiKeyCtx(admin!.id, 'admin', ['edit', 'view'], 'key-4');
    await expect(pageAttachments.attachFile(ctx, pageId, PDF, 'a.pdf')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('canReadAttachment — reading needs no independent scope (FR-003b/FR-003c)', () => {
  it('lets an anonymous caller read an attachment on a published, public-visibility page', async () => {
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: randomUUID() })
      .where(eq(schema.pages.id, pageId));
    const created = await pageAttachments.attachFile(editorCtx(), pageId, PDF, 'a.pdf');

    const result = await pageAttachments.getServableAttachment(buildAnonymousCtx(), created.id);
    expect(result.kind).toBe('ok');
  });

  it('refuses an anonymous caller on an unpublished page — indistinguishable from a missing attachment', async () => {
    const created = await pageAttachments.attachFile(editorCtx(), pageId, PDF, 'a.pdf');
    const result = await pageAttachments.getServableAttachment(buildAnonymousCtx(), created.id);
    expect(result.kind).toBe('not_found');
  });

  it('lets an API key with only the view scope (no attachments scope) list and download (SC-007)', async () => {
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: randomUUID() })
      .where(eq(schema.pages.id, pageId));
    const created = await pageAttachments.attachFile(editorCtx(), pageId, PDF, 'a.pdf');

    const ctx = buildApiKeyCtx(readerId, 'reader', ['view'], 'key-read-1');
    const list = await pageAttachments.listAttachments(ctx, pageId);
    expect(list.map((i) => i.id)).toContain(created.id);
    expect((await pageAttachments.getServableAttachment(ctx, created.id)).kind).toBe('ok');
  });

  it('refuses an API key with no read-granting scope at all', async () => {
    await db
      .update(schema.pages)
      .set({ currentPublishedVersionId: randomUUID() })
      .where(eq(schema.pages.id, pageId));
    const created = await pageAttachments.attachFile(editorCtx(), pageId, PDF, 'a.pdf');

    const ctx = buildApiKeyCtx(readerId, 'reader', ['attachments'], 'key-read-2');
    expect((await pageAttachments.getServableAttachment(ctx, created.id)).kind).toBe('not_found');
    await expect(pageAttachments.listAttachments(ctx, pageId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
