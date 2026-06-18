import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import * as userCenterService from '@/server/services/user-center';
import { DomainError } from '@/server/errors';
import { buildUserCtx, buildApiKeyCtx, buildAnonymousCtx } from '@/server/permissions';

async function createTestUser(input: { email: string; password?: string; role?: 'admin' | 'editor' | 'reader' }) {
  const { userId } = await authService.register({
    email: input.email,
    password: input.password ?? 'Password123!',
  });
  if (input.role && input.role !== 'reader') {
    await db.update(schema.users).set({ role: input.role }).where(eq(schema.users.id, userId));
  }
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new Error('Failed to create test user');
  return { ...user, passwordHash: user.passwordHash, plainPassword: input.password ?? 'Password123!' };
}

describe('user-center service', () => {
  beforeAll(async () => {
    await db.delete(schema.apiAuditEntries);
    await db.delete(schema.apiKeys);
    await db.delete(schema.pageRevisions);
    await db.delete(schema.pages);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('updateProfile', () => {
    it('updates display name for session user', async () => {
      const user = await createTestUser({ email: 'profile@example.com' });
      const ctx = buildUserCtx(user.id, user.role);

      const result = await userCenterService.updateProfile(ctx, { displayName: 'New Name' });
      expect(result.displayName).toBe('New Name');

      const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
      expect(row?.displayName).toBe('New Name');
    });

    it('rejects api_key actor', async () => {
      const user = await createTestUser({ email: 'profile-key@example.com' });
      const ctx = buildApiKeyCtx(user.id, user.role, ['view'], 'key-id');

      await expect(userCenterService.updateProfile(ctx, { displayName: 'X' })).rejects.toThrow(
        DomainError,
      );
    });
  });

  describe('changeEmail', () => {
    it('changes email when unique', async () => {
      const user = await createTestUser({ email: 'email1@example.com' });
      const ctx = buildUserCtx(user.id, user.role);

      const result = await userCenterService.changeEmail(ctx, { email: 'email2@example.com' });
      expect(result.email).toBe('email2@example.com');
    });

    it('rejects duplicate email', async () => {
      const user = await createTestUser({ email: 'email3@example.com' });
      await createTestUser({ email: 'taken@example.com' });
      const ctx = buildUserCtx(user.id, user.role);

      await expect(userCenterService.changeEmail(ctx, { email: 'taken@example.com' })).rejects.toThrow(
        DomainError,
      );
    });
  });

  describe('changePassword', () => {
    it('changes password with correct current password', async () => {
      const user = await createTestUser({ email: 'pwd@example.com', password: 'oldpass123' });
      const ctx = buildUserCtx(user.id, user.role);

      await userCenterService.changePassword(ctx, {
        currentPassword: 'oldpass123',
        newPassword: 'newpass123',
      });

      const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
      expect(await bcrypt.compare('newpass123', row!.passwordHash)).toBe(true);
    });

    it('rejects incorrect current password', async () => {
      const user = await createTestUser({ email: 'pwd2@example.com', password: 'oldpass123' });
      const ctx = buildUserCtx(user.id, user.role);

      await expect(
        userCenterService.changePassword(ctx, {
          currentPassword: 'wrongpass',
          newPassword: 'newpass123',
        }),
      ).rejects.toThrow(DomainError);
    });
  });

  describe('updatePreferences', () => {
    it('saves theme and locale', async () => {
      const user = await createTestUser({ email: 'prefs@example.com' });
      const ctx = buildUserCtx(user.id, user.role);

      const result = await userCenterService.updatePreferences(ctx, {
        theme: 'dark',
        locale: 'zh',
      });
      expect(result.theme).toBe('dark');
      expect(result.locale).toBe('zh');

      const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
      expect(row?.themePreference).toBe('dark');
      expect(row?.localePreference).toBe('zh');
    });

    it('rejects anonymous actor', async () => {
      await expect(
        userCenterService.updatePreferences(buildAnonymousCtx(), { theme: 'dark' }),
      ).rejects.toThrow(DomainError);
    });
  });
});
