import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';

describe('authService', () => {
  beforeAll(async () => {
    await db.delete(schema.pageRevisions);
    await db.delete(schema.pages);
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('register', () => {
    it('creates a user with reader role', async () => {
      const { userId } = await authService.register({
        email: 'reader@example.com',
        password: 'Password123!',
      });

      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });

      expect(user).toBeTruthy();
      expect(user?.role).toBe('reader');
      expect(user?.status).toBe('active');
      expect(await bcrypt.compare('Password123!', user!.passwordHash)).toBe(true);
    });

    it('rejects duplicate emails', async () => {
      await authService.register({ email: 'dup@example.com', password: 'Password123!' });
      await expect(
        authService.register({ email: 'dup@example.com', password: 'Password123!' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('login', () => {
    it('returns userId for valid credentials', async () => {
      const { userId } = await authService.register({
        email: 'login@example.com',
        password: 'Password123!',
      });

      const result = await authService.login({
        email: 'login@example.com',
        password: 'Password123!',
      });

      expect(result.userId).toBe(userId);
    });

    it('rejects wrong password', async () => {
      await authService.register({ email: 'badpass@example.com', password: 'Password123!' });
      await expect(
        authService.login({ email: 'badpass@example.com', password: 'wrong-password' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects disabled account', async () => {
      await authService.register({ email: 'disabled@example.com', password: 'Password123!' });
      await db
        .update(schema.users)
        .set({ status: 'disabled' })
        .where(eq(schema.users.email, 'disabled@example.com'));

      await expect(
        authService.login({ email: 'disabled@example.com', password: 'Password123!' }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('getCurrentActor', () => {
    it('returns anonymous when the session id does not exist', async () => {
      // Seed a user/session so that a buggy "return first row" query would
      // incorrectly return a user instead of anonymous.
      const { userId } = await authService.register({
        email: 'actor-check@example.com',
        password: 'Password123!',
      });
      await db.insert(schema.sessions).values({
        id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        userId,
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      const actor = await authService.resolveActorFromSession('no-such-session-id');

      expect(actor).toBeNull();
    });
  });
});
