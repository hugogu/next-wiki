import bcrypt from 'bcryptjs';
import { eq, ne, and } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import type {
  UpdateProfileInput,
  ChangeEmailInput,
  ChangePasswordInput,
  UpdatePreferencesInput,
  PreferencesView,
} from '@next-wiki/shared';
import { isLocale } from '@/i18n/config';

function requireUser(ctx: PermCtx): { userId: string } {
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('UNAUTHORIZED', 'Sign in to manage your account');
  }
  return { userId: ctx.actor.userId };
}

/**
 * Resolve the acting user for preference operations. Unlike other account
 * actions, preferences may be driven by an API key carrying the `preferences`
 * scope (manage_preferences, self only — FR-023/FR-024).
 */
function requirePreferenceActor(ctx: PermCtx): { userId: string } {
  const userId = getActorUserId(ctx);
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to manage your preferences');
  }
  if (!can(ctx, 'manage_preferences', { kind: 'preferences' })) {
    throw new DomainError('FORBIDDEN', 'This API key cannot manage preferences');
  }
  return { userId };
}

export async function updateProfile(
  ctx: PermCtx,
  input: UpdateProfileInput,
): Promise<{ id: string; email: string; displayName: string | null }> {
  const { userId } = requireUser(ctx);

  const [updated] = await db
    .update(schema.users)
    .set({
      displayName: input.displayName ? input.displayName.trim() : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) {
    throw new DomainError('NOT_FOUND', 'User not found');
  }

  return {
    id: updated.id,
    email: updated.email,
    displayName: updated.displayName,
  };
}

export async function changeEmail(
  ctx: PermCtx,
  input: ChangeEmailInput,
): Promise<{ id: string; email: string }> {
  const { userId } = requireUser(ctx);
  const email = input.email.trim().toLowerCase();

  const existing = await db.query.users.findFirst({
    where: and(eq(schema.users.email, email), ne(schema.users.id, userId)),
  });
  if (existing) {
    throw new DomainError('CONFLICT', 'An account with this email already exists');
  }

  const [updated] = await db
    .update(schema.users)
    .set({ email, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) {
    throw new DomainError('NOT_FOUND', 'User not found');
  }

  return { id: updated.id, email: updated.email };
}

export async function changePassword(
  ctx: PermCtx,
  input: ChangePasswordInput,
): Promise<void> {
  const { userId } = requireUser(ctx);

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  if (!user) {
    throw new DomainError('NOT_FOUND', 'User not found');
  }

  const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new DomainError('UNAUTHORIZED', 'Current password is incorrect');
  }

  if (input.newPassword.length < 8) {
    throw new DomainError('BAD_REQUEST', 'Password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);

  await db
    .update(schema.users)
    .set({ passwordHash, mustResetPassword: false, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function updatePreferences(
  ctx: PermCtx,
  input: UpdatePreferencesInput,
): Promise<PreferencesView> {
  const { userId } = requirePreferenceActor(ctx);

  if (input.locale !== undefined && input.locale !== null && !isLocale(input.locale)) {
    throw new DomainError('BAD_REQUEST', 'Unsupported UI locale');
  }

  const updates: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
  if (input.theme !== undefined) updates.themePreference = input.theme;
  if (input.locale !== undefined) updates.localePreference = input.locale;

  const [updated] = await db
    .update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, userId))
    .returning();

  if (!updated) {
    throw new DomainError('NOT_FOUND', 'User not found');
  }

  return {
    theme: updated.themePreference as PreferencesView['theme'],
    locale: updated.localePreference as PreferencesView['locale'],
  };
}

export async function getPreferences(ctx: PermCtx): Promise<PreferencesView | null> {
  const userId = getActorUserId(ctx);
  if (!userId || !can(ctx, 'manage_preferences', { kind: 'preferences' })) return null;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { themePreference: true, localePreference: true },
  });

  if (!user) return null;

  return {
    theme: (user.themePreference as PreferencesView['theme']) ?? null,
    locale: (user.localePreference as PreferencesView['locale']) ?? null,
  };
}
