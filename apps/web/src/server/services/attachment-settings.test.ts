import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildAnonymousCtx, buildApiKeyCtx, buildUserCtx, type PermCtx } from '@/server/permissions';
import { getAttachmentSettings, updateAttachmentSettings } from '@/server/services/attachment-settings';

let adminId: string;
let editorId: string;

const adminCtx = (): PermCtx => buildUserCtx(adminId, 'admin');
const editorCtx = (): PermCtx => buildUserCtx(editorId, 'editor');

async function cleanup() {
  await db.delete(schema.attachmentSettings);
}

beforeAll(async () => {
  await cleanup();
  await db.delete(schema.users);
  const [admin] = await db
    .insert(schema.users)
    .values({ email: 'attach-settings-admin@example.com', passwordHash: 'HASH', role: 'admin' })
    .returning();
  adminId = admin!.id;
  const [editor] = await db
    .insert(schema.users)
    .values({ email: 'attach-settings-editor@example.com', passwordHash: 'HASH', role: 'editor' })
    .returning();
  editorId = editor!.id;
});

afterAll(async () => {
  await cleanup();
  await db.delete(schema.users);
  await closeDb();
});

beforeEach(cleanup);

describe('getAttachmentSettings', () => {
  it('returns the schema defaults (20 MB, image+video+document) when no row exists', async () => {
    const settings = await getAttachmentSettings();
    expect(settings.maxSizeBytes).toBe(20 * 1024 * 1024);
    expect(settings.allowedCategories.sort()).toEqual(['document', 'image', 'video']);
  });

  it('returns the stored configuration once an admin has changed it', async () => {
    await updateAttachmentSettings(adminCtx(), { maxSizeBytes: 5 * 1024 * 1024, allowedCategories: ['image'] });
    const settings = await getAttachmentSettings();
    expect(settings.maxSizeBytes).toBe(5 * 1024 * 1024);
    expect(settings.allowedCategories).toEqual(['image']);
    expect(settings.updatedBy).toBe(adminId);
  });
});

describe('updateAttachmentSettings — validation', () => {
  it('rejects a non-positive maxSizeBytes', async () => {
    await expect(
      updateAttachmentSettings(adminCtx(), { maxSizeBytes: 0, allowedCategories: ['image'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      updateAttachmentSettings(adminCtx(), { maxSizeBytes: -1, allowedCategories: ['image'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects an empty allowedCategories list', async () => {
    await expect(
      updateAttachmentSettings(adminCtx(), { maxSizeBytes: 1024, allowedCategories: [] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('updateAttachmentSettings — permission (manage_storage gate, mirrors storage-config.ts)', () => {
  it('lets an admin session update', async () => {
    const result = await updateAttachmentSettings(adminCtx(), {
      maxSizeBytes: 1024 * 1024,
      allowedCategories: ['document'],
    });
    expect(result.maxSizeBytes).toBe(1024 * 1024);
  });

  it('refuses an editor session', async () => {
    await expect(
      updateAttachmentSettings(editorCtx(), { maxSizeBytes: 1024, allowedCategories: ['image'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses an anonymous caller', async () => {
    await expect(
      updateAttachmentSettings(buildAnonymousCtx(), { maxSizeBytes: 1024, allowedCategories: ['image'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets an admin-owned API key with the storage scope update, and refuses one without it', async () => {
    const withScope = buildApiKeyCtx(adminId, 'admin', ['storage'], 'settings-key-1');
    await expect(
      updateAttachmentSettings(withScope, { maxSizeBytes: 2048, allowedCategories: ['video'] }),
    ).resolves.toMatchObject({ maxSizeBytes: 2048 });

    const withoutScope = buildApiKeyCtx(adminId, 'admin', ['view'], 'settings-key-2');
    await expect(
      updateAttachmentSettings(withoutScope, { maxSizeBytes: 4096, allowedCategories: ['video'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('SC-005: changing settings never affects already-stored attachments', () => {
  it('read of current settings is independent of anything previously validated against older settings', async () => {
    // The settings service itself only ever reflects the *current*
    // configuration; FR-012/SC-005 (existing attachments stay downloadable
    // regardless of later config changes) is enforced by attachFile only
    // consulting settings at upload time, covered in page-attachments.test.ts.
    await updateAttachmentSettings(adminCtx(), { maxSizeBytes: 100, allowedCategories: ['image'] });
    let settings = await getAttachmentSettings();
    expect(settings.maxSizeBytes).toBe(100);

    await updateAttachmentSettings(adminCtx(), { maxSizeBytes: 200, allowedCategories: ['document'] });
    settings = await getAttachmentSettings();
    expect(settings.maxSizeBytes).toBe(200);
    expect(settings.allowedCategories).toEqual(['document']);
  });
});
