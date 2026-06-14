import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { eq, gt } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { env } from '@/server/config';
import type { Actor } from '@/server/permissions';

const SESSION_COOKIE = 'next-wiki-session';
const SESSION_MAX_AGE_DAYS = 30;

export async function register(input: { email: string; password: string }): Promise<{ userId: string }> {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, input.email),
  });

  if (existing) {
    throw new Error('EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const [user] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash,
      role: 'reader',
      status: 'active',
    })
    .returning({ id: schema.users.id });

  if (!user) {
    throw new Error('REGISTER_FAILED');
  }

  return { userId: user.id };
}

export async function login(input: { email: string; password: string }): Promise<{ userId: string }> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.email, input.email),
  });

  if (!user || user.status === 'disabled') {
    throw new Error('INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return { userId: user.id };
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
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    return { kind: 'anonymous' };
  }

  const now = new Date();
  const session = await db.query.sessions.findFirst({
    where: (t) => eq(t.id, sessionId) && gt(t.expiresAt, now),
    with: {
      user: true,
    },
  });

  if (!session) {
    cookieStore.delete(SESSION_COOKIE);
    return { kind: 'anonymous' };
  }

  const user = session.user;
  return {
    kind: 'user',
    userId: user.id,
    role: user.role,
  };
}

export type { Actor };
