import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as userService from '@/server/services/users';
import * as authService from '@/server/services/auth';
import { buildUserCtx, buildAnonymousCtx } from '@/server/permissions';

async function createUser(email: string, role: 'admin' | 'editor' | 'reader') {
  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role, status: 'active' })
    .returning();
  if (!user) throw new Error('Failed to create user');
  return user;
}

async function cleanup() {
  await db.delete(schema.pageRevisions);
  await db.delete(schema.pages);
  await db.delete(schema.sessions);
  await db.delete(schema.users);
}

describe('userService US5', () => {
  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  describe('list', () => {
    it('returns all users for admin', async () => {
      const admin = await createUser('admin-list@example.com', 'admin');
      await createUser('reader-list@example.com', 'reader');

      const users = await userService.list(buildUserCtx(admin.id, 'admin'));

      expect(users.length).toBeGreaterThanOrEqual(2);
      expect(users.map((u) => u.email)).toContain('reader-list@example.com');
    });

    it('denies non-admin callers without leaking data', async () => {
      const editor = await createUser('editor-list@example.com', 'editor');
      const reader = await createUser('reader-list-deny@example.com', 'reader');

      await expect(userService.list(buildUserCtx(editor.id, 'editor'))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(userService.list(buildUserCtx(reader.id, 'reader'))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(userService.list(buildAnonymousCtx())).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('setRole', () => {
    it('is effective on the next request (no stale elevation)', async () => {
      const admin = await createUser('admin-setrole@example.com', 'admin');
      const target = await createUser('target-setrole@example.com', 'reader');

      await userService.setRole(buildUserCtx(admin.id, 'admin'), target.id, 'editor');

      // Simulate the user's next request: their role is read fresh from the DB.
      const actor = await authService.resolveActorFromSession('no-session');
      expect(actor).toBeNull();

      const updated = await db.query.users.findFirst({
        where: eq(schema.users.id, target.id),
      });
      expect(updated?.role).toBe('editor');
    });

    it('prevents self-demotion', async () => {
      const admin = await createUser('admin-self@example.com', 'admin');

      await expect(
        userService.setRole(buildUserCtx(admin.id, 'admin'), admin.id, 'editor'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('setStatus', () => {
    it('disables and enables users', async () => {
      const admin = await createUser('admin-status@example.com', 'admin');
      const target = await createUser('target-status@example.com', 'reader');

      await userService.setStatus(buildUserCtx(admin.id, 'admin'), target.id, 'disabled');
      let updated = await db.query.users.findFirst({ where: eq(schema.users.id, target.id) });
      expect(updated?.status).toBe('disabled');

      await userService.setStatus(buildUserCtx(admin.id, 'admin'), target.id, 'active');
      updated = await db.query.users.findFirst({ where: eq(schema.users.id, target.id) });
      expect(updated?.status).toBe('active');
    });

    it('prevents self-disable', async () => {
      const admin = await createUser('admin-disable-self@example.com', 'admin');

      await expect(
        userService.setStatus(buildUserCtx(admin.id, 'admin'), admin.id, 'disabled'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('resetPassword', () => {
    it('sets a new temporary password and the must_reset_password flag', async () => {
      const admin = await createUser('admin-reset@example.com', 'admin');
      const target = await createUser('target-reset@example.com', 'reader');

      await userService.resetPassword(buildUserCtx(admin.id, 'admin'), target.id, 'TempPass123!');

      const updated = await db.query.users.findFirst({ where: eq(schema.users.id, target.id) });
      expect(updated?.mustResetPassword).toBe(true);
      expect(await bcrypt.compare('TempPass123!', updated!.passwordHash)).toBe(true);
    });

    it('rejects weak temporary passwords', async () => {
      const admin = await createUser('admin-reset-weak@example.com', 'admin');
      const target = await createUser('target-reset-weak@example.com', 'reader');

      await expect(
        userService.resetPassword(buildUserCtx(admin.id, 'admin'), target.id, 'short'),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('denies non-admin callers', async () => {
      const editor = await createUser('editor-reset@example.com', 'editor');
      const target = await createUser('target-reset-deny@example.com', 'reader');

      await expect(
        userService.resetPassword(buildUserCtx(editor.id, 'editor'), target.id, 'TempPass123!'),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('setMyPassword', () => {
    it('updates password and clears must_reset_password', async () => {
      const user = await createUser('user-mypassword@example.com', 'reader');
      await db.update(schema.users).set({ mustResetPassword: true }).where(eq(schema.users.id, user.id));

      await authService.setMyPassword(buildUserCtx(user.id, 'reader'), 'NewSecurePass123!');

      const updated = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
      expect(updated?.mustResetPassword).toBe(false);
      expect(await bcrypt.compare('NewSecurePass123!', updated!.passwordHash)).toBe(true);
    });

    it('rejects unauthenticated callers', async () => {
      await expect(authService.setMyPassword(buildAnonymousCtx(), 'NewPass123!')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('rejects weak passwords', async () => {
      const user = await createUser('user-weak@example.com', 'reader');
      await expect(
        authService.setMyPassword(buildUserCtx(user.id, 'reader'), 'short'),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });
});
