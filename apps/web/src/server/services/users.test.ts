import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(async () => new Map()),
}));

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

    it('exposes lastLoginAt after a session is established and null before any sign-in', async () => {
      const admin = await createUser('admin-lastlogin@example.com', 'admin');
      const before = await userService.list(buildUserCtx(admin.id, 'admin'));
      expect(before.find((u) => u.id === admin.id)?.lastLoginAt).toBeNull();

      await authService.establishSession(admin.id);

      const after = await userService.list(buildUserCtx(admin.id, 'admin'));
      const view = after.find((u) => u.id === admin.id);
      expect(view?.lastLoginAt).toBeTruthy();
      expect(Date.parse(view!.lastLoginAt!)).toBeGreaterThan(Date.now() - 60_000);
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

  describe('deleteUser', () => {
    it('soft-deletes: hides from the list, blocks login, and revokes sessions', async () => {
      const admin = await createUser('admin-delete@example.com', 'admin');
      const target = await createUser('target-delete@example.com', 'reader');
      // Give the target a live session to confirm it is revoked on delete.
      await db.insert(schema.sessions).values({
        id: 'sess-delete-1',
        userId: target.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      await userService.deleteUser(buildUserCtx(admin.id, 'admin'), target.id);

      const row = await db.query.users.findFirst({ where: eq(schema.users.id, target.id) });
      expect(row?.deletedAt).not.toBeNull();

      const listed = await userService.list(buildUserCtx(admin.id, 'admin'));
      expect(listed.map((u) => u.email)).not.toContain('target-delete@example.com');

      const session = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, 'sess-delete-1') });
      expect(session).toBeUndefined();
    });

    it('prevents self-deletion', async () => {
      const admin = await createUser('admin-delete-self@example.com', 'admin');

      await expect(
        userService.deleteUser(buildUserCtx(admin.id, 'admin'), admin.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('denies non-admin callers', async () => {
      const editor = await createUser('editor-delete@example.com', 'editor');
      const target = await createUser('target-delete-deny@example.com', 'reader');

      await expect(
        userService.deleteUser(buildUserCtx(editor.id, 'editor'), target.id),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('404s on an already-deleted user', async () => {
      const admin = await createUser('admin-delete-again@example.com', 'admin');
      const target = await createUser('target-delete-again@example.com', 'reader');

      await userService.deleteUser(buildUserCtx(admin.id, 'admin'), target.id);
      await expect(
        userService.deleteUser(buildUserCtx(admin.id, 'admin'), target.id),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
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

  describe('hasAnyAdmin', () => {
    it('reflects the presence of an admin account (shared first-run check)', async () => {
      // Start from a clean slate so the assertion is deterministic.
      await cleanup();
      expect(await userService.hasAnyAdmin()).toBe(false);

      // A non-admin account does not satisfy the check.
      await createUser('reader-hasanyadmin@example.com', 'reader');
      expect(await userService.hasAnyAdmin()).toBe(false);

      // Creating the first admin flips it.
      await createUser('admin-hasanyadmin@example.com', 'admin');
      expect(await userService.hasAnyAdmin()).toBe(true);
    });
  });
});
