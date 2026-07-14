import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, type PermCtx } from '@/server/permissions';
import { env } from '@/server/config';

/** Binding-confirmation links are single-use and short-lived. */
const TOKEN_TTL_MS = 10 * 60 * 1000;

export type ActiveBinding = {
  id: string;
  userId: string;
  openId: string;
  displayName: string | null;
};

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Resolve the active binding for a Feishu identity. A binding whose Wiki user is
 * disabled is treated as unbound (the identity must re-bind), without mutating
 * the stored binding row.
 */
export async function getActiveBinding(openId: string): Promise<ActiveBinding | null> {
  const row = await db.query.feishuBindings.findFirst({
    where: and(
      eq(schema.feishuBindings.openId, openId),
      eq(schema.feishuBindings.status, 'active'),
    ),
    with: { user: { columns: { id: true, status: true, displayName: true } } },
  });
  if (!row || !row.user || row.user.status !== 'active') return null;
  return {
    id: row.id,
    userId: row.userId,
    openId: row.openId,
    displayName: row.user.displayName,
  };
}

/**
 * Issue a single-use binding token for a Feishu identity and return the raw
 * token plus the confirmation URL. Only the token hash is stored.
 */
export async function issueBindingToken(
  openId: string,
): Promise<{ token: string; url: string }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(schema.feishuBindingTokens).values({
    tokenHash: hashToken(token),
    openId,
    expiresAt,
  });
  const url = `${env.APP_URL}/user-center/feishu/bind?token=${encodeURIComponent(token)}`;
  return { token, url };
}

export type ConfirmResult = {
  bindingId: string;
  openId: string;
  userId: string;
  displayName: string | null;
};

/**
 * Confirm a binding: the signed-in Wiki user claims the Feishu identity carried
 * by the token. The token is consumed atomically (single-use) and must be
 * unexpired. Any earlier active binding for the same identity is revoked so the
 * "one active binding per Feishu identity" invariant holds.
 */
export async function confirmBinding(input: {
  token: string;
  userId: string;
}): Promise<ConfirmResult> {
  const tokenHash = hashToken(input.token);
  // Atomic single-use consume: only succeeds if not already used and unexpired.
  const [consumed] = await db
    .update(schema.feishuBindingTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.feishuBindingTokens.tokenHash, tokenHash),
        isNull(schema.feishuBindingTokens.usedAt),
        gt(schema.feishuBindingTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!consumed) {
    throw new DomainError('BAD_REQUEST', 'This binding link is invalid, expired, or already used');
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, input.userId),
    columns: { id: true, status: true, displayName: true },
  });
  if (!user || user.status !== 'active') {
    throw new DomainError('FORBIDDEN', 'Your account cannot complete this binding');
  }

  const openId = consumed.openId;
  // Revoke any current active binding for this identity (possibly another user).
  await db
    .update(schema.feishuBindings)
    .set({ status: 'revoked', revokedAt: new Date(), revocationReason: 'rebound' })
    .where(
      and(
        eq(schema.feishuBindings.openId, openId),
        eq(schema.feishuBindings.status, 'active'),
      ),
    );

  const [binding] = await db
    .insert(schema.feishuBindings)
    .values({
      userId: user.id,
      openId,
      displayName: user.displayName,
      status: 'active',
      lastSeenAt: new Date(),
    })
    .returning();

  return {
    bindingId: binding!.id,
    openId,
    userId: user.id,
    displayName: user.displayName,
  };
}

/** Record that a binding was just seen (best-effort activity timestamp). */
export async function touchBinding(bindingId: string): Promise<void> {
  await db
    .update(schema.feishuBindings)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.feishuBindings.id, bindingId));
}

/** Expire all active bot sessions for a binding (unbind/revocation/deactivation). */
export async function expireSessionsForBinding(bindingId: string): Promise<void> {
  await db
    .update(schema.feishuBotSessions)
    .set({ state: 'expired' })
    .where(
      and(
        eq(schema.feishuBotSessions.bindingId, bindingId),
        eq(schema.feishuBotSessions.state, 'active'),
      ),
    );
}

/** A signed-in user unbinds their own Feishu identity. */
export async function unbindOwn(userId: string): Promise<number> {
  const rows = await db
    .update(schema.feishuBindings)
    .set({ status: 'revoked', revokedAt: new Date(), revocationReason: 'user_unbind' })
    .where(
      and(
        eq(schema.feishuBindings.userId, userId),
        eq(schema.feishuBindings.status, 'active'),
      ),
    )
    .returning({ id: schema.feishuBindings.id });
  for (const r of rows) await expireSessionsForBinding(r.id);
  return rows.length;
}

/** An administrator revokes a specific binding. */
export async function revokeBinding(
  ctx: PermCtx,
  bindingId: string,
  reason = 'admin_revoked',
): Promise<void> {
  if (!can(ctx, 'manage_ai', { kind: 'ai_settings' })) {
    throw new DomainError('FORBIDDEN', 'Admin access required to revoke bindings');
  }
  const [row] = await db
    .update(schema.feishuBindings)
    .set({ status: 'revoked', revokedAt: new Date(), revocationReason: reason })
    .where(
      and(
        eq(schema.feishuBindings.id, bindingId),
        eq(schema.feishuBindings.status, 'active'),
      ),
    )
    .returning({ id: schema.feishuBindings.id });
  if (row) await expireSessionsForBinding(row.id);
}
