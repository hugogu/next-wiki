import { cookies, headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import { DomainError } from '@/server/errors';
import type { Actor, PermCtx } from '@/server/permissions';
import * as apiKeys from '@/server/services/api-keys';
import { hasAnyAdmin } from '@/server/services/users';
import { normalizeEmail } from '@/server/services/email';
import { hashAnonymousActionToken } from '@/server/services/ai-actions';

export const SESSION_COOKIE = 'next-wiki-session';
export const ANONYMOUS_AI_COOKIE = 'next-wiki-anonymous-ai';
const SESSION_MAX_AGE_DAYS = 30;

export { normalizeEmail } from '@/server/services/email';

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
  // A soft-deleted account must not authenticate, even with a still-valid session.
  if (user.deletedAt) {
    return null;
  }
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
        spaceAccess: resolved.spaceAccess,
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

export async function register(
  input: { email: string; password: string },
  anonymousAiToken?: string,
): Promise<{ userId: string; migratedActionCount: number }> {
  const email = normalizeEmail(input.email);
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existing) {
    throw new DomainError('CONFLICT', 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  // Shared first-admin check: the first account becomes admin (safety net so
  // an instance is never admin-less), subsequent registrations are readers.
  // The guided first-run path is `/setup`; registration is the normal-user
  // path. Both share this single source of truth (see users.hasAnyAdmin).
  const adminExists = await hasAnyAdmin();

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({
        email,
        passwordHash,
        role: adminExists ? 'reader' : 'admin',
        status: 'active',
      })
      .returning({ id: schema.users.id });

    if (!user) throw new Error('REGISTER_FAILED');

    // The browser never exposes this HttpOnly capability to JavaScript. Its
    // hash was recorded with each anonymous question, so registration can
    // atomically claim only this browser's anonymous AI actions without
    // accepting a user-controlled conversation payload.
    const claimed = anonymousAiToken
      ? await tx
          .update(schema.aiActions)
          .set({ actorUserId: user.id })
          .where(and(
            eq(schema.aiActions.feature, 'wiki_question'),
            isNull(schema.aiActions.actorUserId),
            sql`${schema.aiActions.requestMetadata} ->> 'anonymousAccessTokenHash' = ${hashAnonymousActionToken(anonymousAiToken)}`,
          ))
          .returning({ id: schema.aiActions.id })
      : [];

    return { userId: user.id, migratedActionCount: claimed.length };
  });

  return result;
}

export async function login(input: { email: string; password: string }): Promise<{ userId: string; mustResetPassword: boolean }> {
  const email = normalizeEmail(input.email);
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (!user || user.status === 'disabled' || user.deletedAt) {
    throw new DomainError('UNAUTHORIZED', 'Invalid email or password');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new DomainError('UNAUTHORIZED', 'Invalid email or password');
  }

  return { userId: user.id, mustResetPassword: user.mustResetPassword };
}

// `NODE_ENV === 'production'` is not "served over HTTPS": the packaged
// Docker image always sets NODE_ENV=production, including for a plain-HTTP
// LAN/self-hosted deployment (e.g. http://192.168.x.x:3000). A `Secure`
// cookie set over such a connection is silently dropped by the browser —
// login appears to succeed (the session row is created) but the client
// never persists the cookie, so every subsequent request looks anonymous.
// APP_URL is the app's own declared public origin, so derive `secure` from
// its scheme instead.
export function isSecureCookieUrl(appUrl: string): boolean {
  // URL schemes are case-insensitive (RFC 3986); a plain `startsWith`
  // check would miss a validly-cased-but-uppercase `HTTPS://...` APP_URL
  // and silently weaken the cookie. `env.APP_URL` is already validated by
  // Zod's `z.string().url()`, so parsing here can't throw.
  return new URL(appUrl).protocol === 'https:';
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
  await db
    .update(schema.users)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.users.id, userId));

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: isSecureCookieUrl(env.APP_URL),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * A browser-local capability for anonymous Wiki AI actions. It is HttpOnly so
 * it cannot leak through client-side URLs, history, referrers, or scripts.
 */
export async function getOrCreateAnonymousAiAccessToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANONYMOUS_AI_COOKIE)?.value;
  if (existing) return existing;

  const token = generateSessionId();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);
  cookieStore.set(ANONYMOUS_AI_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookieUrl(env.APP_URL),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return token;
}

export async function getAnonymousAiAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ANONYMOUS_AI_COOKIE)?.value;
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
