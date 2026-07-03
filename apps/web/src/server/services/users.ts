import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx, getActorUserId } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import type { UserView } from '@next-wiki/shared';

function getUserId(ctx: PermCtx): string | null {
  return getActorUserId(ctx);
}

function requireAdmin(ctx: PermCtx): void {
  if (!can(ctx, 'manage_users', { kind: 'users' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage users');
  }
}

/**
 * Shared first-admin check: returns true if at least one admin account exists.
 *
 * This is the single source of truth for the "first-run / onboarding" decision
 * used by the `/setup` bootstrap route and by registration (which grants admin
 * to the first account as a safety net). Pre-auth/bootstrap callers use this
 * directly because no permission context exists yet.
 */
export async function hasAnyAdmin(): Promise<boolean> {
  const existingAdmin = await db.query.users.findFirst({
    where: eq(schema.users.role, 'admin'),
  });
  return Boolean(existingAdmin);
}

export async function list(ctx: PermCtx): Promise<UserView[]> {
  requireAdmin(ctx);
  return listInternal();
}

/**
 * Returns null when the caller lacks manage_users permission (no data leak).
 * Used by the admin route to decide whether to render or 404.
 */
export async function listSafe(ctx: PermCtx): Promise<UserView[] | null> {
  if (!can(ctx, 'manage_users', { kind: 'users' })) return null;
  return listInternal();
}

async function listInternal(): Promise<UserView[]> {
  const rows = await db.query.users.findMany({
    orderBy: schema.users.createdAt,
  });

  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    displayName: u.displayName,
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function setRole(ctx: PermCtx, userId: string, role: 'admin' | 'editor' | 'reader'): Promise<void> {
  requireAdmin(ctx);

  // Prevent an admin from removing their own admin role and locking themselves out.
  const currentUserId = getUserId(ctx);
  if (userId === currentUserId && role !== 'admin') {
    throw new DomainError('FORBIDDEN', 'You cannot remove your own admin role');
  }

  const [updated] = await db
    .update(schema.users)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) {
    throw new DomainError('NOT_FOUND', 'User not found');
  }
}

export async function setStatus(ctx: PermCtx, userId: string, status: 'active' | 'disabled'): Promise<void> {
  requireAdmin(ctx);

  const currentUserId = getUserId(ctx);
  if (userId === currentUserId && status === 'disabled') {
    throw new DomainError('FORBIDDEN', 'You cannot disable your own account');
  }

  const [updated] = await db
    .update(schema.users)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) {
    throw new DomainError('NOT_FOUND', 'User not found');
  }
}

export async function resetPassword(
  ctx: PermCtx,
  userId: string,
  tempPassword: string,
): Promise<void> {
  requireAdmin(ctx);

  if (tempPassword.length < 8) {
    throw new DomainError('BAD_REQUEST', 'Temporary password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const [updated] = await db
    .update(schema.users)
    .set({ passwordHash, mustResetPassword: true, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) {
    throw new DomainError('NOT_FOUND', 'User not found');
  }
}
