import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { buildUserCtx } from '@/server/permissions';
import * as authService from '@/server/services/auth';
import {
  DEFAULT_SEARCH_SETTINGS,
  getSearchSettings,
  readSearchSettings,
  updateSearchSettings,
} from './search-settings';

async function createUser(role: 'admin' | 'reader') {
  const { userId } = await authService.register({
    email: `search-settings-${role}-${crypto.randomUUID()}@example.com`,
    password: 'Password123!',
  });
  if (role === 'admin') {
    await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  }
  return buildUserCtx(userId, role);
}

describe('search settings service', () => {
  beforeEach(async () => {
    await db.delete(schema.searchSettings);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('returns every capability enabled by default', async () => {
    await expect(getSearchSettings()).resolves.toEqual(DEFAULT_SEARCH_SETTINGS);
  });

  it('persists each independent capability switch for an administrator', async () => {
    const admin = await createUser('admin');
    const saved = await updateSearchSettings(admin, {
      fullTextSearchEnabled: false,
      fuzzySearchEnabled: true,
      semanticSearchEnabled: false,
    });

    expect(saved).toMatchObject({
      fullTextSearchEnabled: false,
      fuzzySearchEnabled: true,
      semanticSearchEnabled: false,
    });
    await expect(readSearchSettings(admin)).resolves.toMatchObject(saved);
  });

  it('rejects disabling both lexical capabilities', async () => {
    const admin = await createUser('admin');
    await expect(updateSearchSettings(admin, {
      fullTextSearchEnabled: false,
      fuzzySearchEnabled: false,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' } satisfies Partial<DomainError>);
  });

  it('does not let non-administrators read or change capability settings', async () => {
    const reader = await createUser('reader');
    await expect(readSearchSettings(reader)).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<DomainError>);
    await expect(updateSearchSettings(reader, { fuzzySearchEnabled: false })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<DomainError>);
  });
});
