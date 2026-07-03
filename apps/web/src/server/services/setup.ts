import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import * as authService from '@/server/services/auth';
import { hasAnyAdmin } from '@/server/services/users';
import { DomainError } from '@/server/errors';

/**
 * Returns true if the first-run setup is still needed (zero admins exist).
 */
export async function isSetupNeeded(): Promise<boolean> {
  return !(await hasAnyAdmin());
}

/**
 * One-time bootstrap: create the first admin account.
 *
 * This is safe to call repeatedly because it is gated by a DB check for zero
 * admins. If any admin already exists, it returns FORBIDDEN and makes no
 * changes.
 */
export async function setupAdmin(input: { email: string; password: string }): Promise<{ userId: string }> {
  if (await hasAnyAdmin()) {
    throw new DomainError('FORBIDDEN', 'An admin account already exists');
  }

  const existingEmail = await db.query.users.findFirst({
    where: eq(schema.users.email, input.email),
  });

  if (existingEmail) {
    throw new DomainError('CONFLICT', 'An account with this email already exists');
  }

  if (input.password.length < 8) {
    throw new DomainError('BAD_REQUEST', 'Password must be at least 8 characters');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const [user] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      passwordHash,
      role: 'admin',
      status: 'active',
    })
    .returning();

  if (!user) {
    throw new Error('SETUP_FAILED');
  }

  await authService.establishSession(user.id);

  return { userId: user.id };
}
