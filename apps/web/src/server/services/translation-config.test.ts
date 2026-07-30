import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
  MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
  MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
  translationSettingsUpdateSchema,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import {
  getTranslationSettings,
  readSettings,
  updateSettings,
} from '@/server/services/translation-config';

async function seedAdmin(): Promise<string> {
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, email: `admin-${id}@example.com`, passwordHash: 'x', role: 'admin' });
  return id;
}

async function seedEditor(): Promise<string> {
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, email: `editor-${id}@example.com`, passwordHash: 'x', role: 'editor' });
  return id;
}

describe('translation runtime settings', () => {
  beforeEach(async () => {
    await db.execute(sql.raw('truncate table translation_settings, users restart identity cascade'));
  });

  it('reads a documented default before anything is configured', async () => {
    expect(await getTranslationSettings()).toEqual({
      requestTimeoutSeconds: DEFAULT_TRANSLATION_REQUEST_TIMEOUT_SECONDS,
      updatedAt: null,
    });
  });

  it('persists a longer per-page timeout for the worker to read', async () => {
    const adminId = await seedAdmin();
    const saved = await updateSettings(buildUserCtx(adminId, 'admin'), {
      requestTimeoutSeconds: 900,
    });
    expect(saved.requestTimeoutSeconds).toBe(900);
    expect(saved.updatedAt).not.toBeNull();
    // The worker reads without an actor.
    expect((await getTranslationSettings()).requestTimeoutSeconds).toBe(900);

    const row = await db.query.translationSettings.findFirst();
    expect(row?.updatedBy).toBe(adminId);
  });

  it('keeps the timeout inside the range the database also enforces', () => {
    expect(
      translationSettingsUpdateSchema.safeParse({
        requestTimeoutSeconds: MIN_TRANSLATION_REQUEST_TIMEOUT_SECONDS - 1,
      }).success,
    ).toBe(false);
    expect(
      translationSettingsUpdateSchema.safeParse({
        requestTimeoutSeconds: MAX_TRANSLATION_REQUEST_TIMEOUT_SECONDS + 1,
      }).success,
    ).toBe(false);
    expect(
      translationSettingsUpdateSchema.safeParse({ requestTimeoutSeconds: 600 }).success,
    ).toBe(true);
  });

  it('rejects a value the schema would allow but the check constraint forbids', async () => {
    await expect(
      db.insert(schema.translationSettings).values({ id: 'default', requestTimeoutSeconds: 5 }),
    ).rejects.toMatchObject({ constraint_name: 'translation_settings_request_timeout_range' });
  });

  it('is administrator-only', async () => {
    const editorId = await seedEditor();
    await expect(readSettings(buildUserCtx(editorId, 'editor'))).rejects.toBeInstanceOf(DomainError);
    await expect(
      updateSettings(buildUserCtx(editorId, 'editor'), { requestTimeoutSeconds: 120 }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
