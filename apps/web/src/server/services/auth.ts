import { cookies, headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';
import type { Actor, PermCtx } from '@/server/permissions';
import * as apiKeys from '@/server/services/api-keys';

const SESSION_COOKIE = 'next-wiki-session';
const SESSION_MAX_AGE_DAYS = 30;

export type ResolvedActor = {
  actor: Actor | null;
  apiKeyInfo?: { keyId: string; userId: string };
  authError?: string;
};

export async function resolveActorFromSession(sessionId: string): Promise<Actor | null> {
  const now = new Date();
  const session = await db.query.sessions.findFirst({
    where: (t) => and(eq(t.id, sessionId), gt(t.expiresAt, now)),
    with: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  const user = session.user;
  return {
    kind: 'user',
    userId: user.id,
    role: user.role,
  };
}

export async function resolveActor(): Promise<ResolvedActor> {
  const headersList = await headers();
  const auth = headersList.get('authorization');

  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (!token) {
      return { actor: null, authError: 'malformed_token' };
    }

    const resolved = await apiKeys.lookupByToken(token);
    if (!resolved) {
      return { actor: null, authError: 'invalid_key' };
    }

    return {
      actor: {
        kind: 'api_key',
        userId: resolved.userId,
        role: resolved.role,
        scopes: resolved.scopes,
        keyId: resolved.keyId,
      },
      apiKeyInfo: { keyId: resolved.keyId, userId: resolved.userId },
    };
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return { actor: { kind: 'anonymous' } };
  }

  const actor = await resolveActorFromSession(sessionId);

  if (!actor) {
    return { actor: { kind: 'anonymous' } };
  }

  return { actor };
}

export async function register(input: { email: string; password: string }): Promise<{ userId: string }> {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, input.email),
  });

  if (existing) {
    throw new DomainError('CONFLICT', 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const anyAdmin = await db.query.users.findFirst({
    where: eq(schema.users.role, 'admin'),
  });

  const [user] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash,
      role: anyAdmin ? 'reader' : 'admin',
      status: 'active',
    })
    .returning({ id: schema.users.id });

  if (!user) {
    throw new Error('REGISTER_FAILED');
  }

  return { userId: user.id };
}

export async function login(input: { email: string; password: string }): Promise<{ userId: string; mustResetPassword: boolean }> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, input.email),
  });

  if (!user || user.status === 'disabled') {
    throw new DomainError('UNAUTHORIZED', 'Invalid email or password');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new DomainError('UNAUTHORIZED', 'Invalid email or password');
  }

  return { userId: user.id, mustResetPassword: user.mustResetPassword };
}

export async function establishSession(userId: string): Promise<void> {
  const sessionId = generateSessionId();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
  }

  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentActor(): Promise<Actor> {
  const resolved = await resolveActor();
  return resolved.actor ?? { kind: 'anonymous' };
}

export async function setMyPassword(ctx: PermCtx, newPassword: string): Promise<void> {
  const userId = ctx.actor.kind === 'user' ? ctx.actor.userId : null;
  if (!userId) {
    throw new DomainError('UNAUTHORIZED', 'Sign in to change your password');
  }

  if (newPassword.length < 8) {
    throw new DomainError('BAD_REQUEST', 'Password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db
    .update(schema.users)
    .set({ passwordHash, mustResetPassword: false, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

/**
 * Returns true if the signed-in user must reset their password before
 * continuing. Returns false for anonymous callers.
 */
export async function mustResetPassword(ctx: PermCtx): Promise<boolean> {
  if (ctx.actor.kind !== 'user') return false;
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, ctx.actor.userId),
  });
  return user?.mustResetPassword ?? false;
}

export type { Actor };
