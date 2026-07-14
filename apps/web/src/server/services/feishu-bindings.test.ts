import { afterAll, beforeEach, describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, closeDb } from '@/server/db';
import * as schema from '@/server/db/schema';
import { buildUserCtx, type PermCtx } from '@/server/permissions';
import * as bindings from '@/server/services/feishu-bindings';

async function makeUser(email: string, role: 'admin' | 'editor' | 'reader' = 'editor') {
  const [u] = await db
    .insert(schema.users)
    .values({ email, passwordHash: 'HASH', role, displayName: email.split('@')[0] })
    .returning();
  return u!;
}

async function cleanup() {
  await db.delete(schema.feishuBindingTokens);
  await db.delete(schema.feishuBotSessions);
  await db.delete(schema.feishuBindings);
  await db.delete(schema.users);
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('feishu-bindings service', () => {
  it('issues a hashed, single-use, 10-minute token and confirms a binding', async () => {
    const user = await makeUser('bind-a@example.com');
    const { token, url } = await bindings.issueBindingToken('ou_a');
    expect(url).toContain(`token=${encodeURIComponent(token)}`);

    // The raw token is never stored — only its hash.
    const rows = await db.select().from(schema.feishuBindingTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(rows[0]!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000 + 1000);

    const result = await bindings.confirmBinding({ token, userId: user.id });
    expect(result.openId).toBe('ou_a');
    expect(result.userId).toBe(user.id);

    const active = await bindings.getActiveBinding('ou_a');
    expect(active?.userId).toBe(user.id);
  });

  it('rejects reuse of a consumed token', async () => {
    const user = await makeUser('bind-b@example.com');
    const { token } = await bindings.issueBindingToken('ou_b');
    await bindings.confirmBinding({ token, userId: user.id });
    await expect(bindings.confirmBinding({ token, userId: user.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects an expired token', async () => {
    const user = await makeUser('bind-c@example.com');
    const { token } = await bindings.issueBindingToken('ou_c');
    // Force expiry.
    await db
      .update(schema.feishuBindingTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.feishuBindingTokens.openId, 'ou_c'));
    await expect(bindings.confirmBinding({ token, userId: user.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rebinding an identity revokes the previous active binding', async () => {
    const userA = await makeUser('bind-d1@example.com');
    const userB = await makeUser('bind-d2@example.com');
    const first = await bindings.issueBindingToken('ou_d');
    await bindings.confirmBinding({ token: first.token, userId: userA.id });
    const second = await bindings.issueBindingToken('ou_d');
    await bindings.confirmBinding({ token: second.token, userId: userB.id });

    const active = await bindings.getActiveBinding('ou_d');
    expect(active?.userId).toBe(userB.id);
    const all = await db
      .select()
      .from(schema.feishuBindings)
      .where(eq(schema.feishuBindings.openId, 'ou_d'));
    expect(all.filter((b) => b.status === 'active')).toHaveLength(1);
    expect(all.filter((b) => b.status === 'revoked')).toHaveLength(1);
  });

  it('treats a deactivated user as unbound', async () => {
    const user = await makeUser('bind-e@example.com');
    const { token } = await bindings.issueBindingToken('ou_e');
    await bindings.confirmBinding({ token, userId: user.id });
    await db.update(schema.users).set({ status: 'disabled' }).where(eq(schema.users.id, user.id));
    expect(await bindings.getActiveBinding('ou_e')).toBeNull();
  });

  it('returns only the requesting user’s active binding without exposing its Feishu id', async () => {
    const userA = await makeUser('bind-own-a@example.com');
    const userB = await makeUser('bind-own-b@example.com');
    const first = await bindings.issueBindingToken('ou_own_a');
    const second = await bindings.issueBindingToken('ou_own_b');
    await bindings.confirmBinding({ token: first.token, userId: userA.id });
    await bindings.confirmBinding({ token: second.token, userId: userB.id });

    const own = await bindings.getOwnActiveBinding(userA.id);
    expect(own).toMatchObject({ displayName: 'bind-own-a' });
    expect(own).not.toHaveProperty('openId');
    expect(await bindings.getOwnActiveBinding(userB.id)).toMatchObject({ displayName: 'bind-own-b' });
  });

  it('lets a user unbind and expires their active sessions', async () => {
    const user = await makeUser('bind-f@example.com');
    const { token } = await bindings.issueBindingToken('ou_f');
    const bound = await bindings.confirmBinding({ token, userId: user.id });
    await db.insert(schema.feishuBotSessions).values({
      bindingId: bound.bindingId,
      chatId: 'oc_f',
      state: 'active',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const count = await bindings.unbindOwn(user.id);
    expect(count).toBe(1);
    expect(await bindings.getActiveBinding('ou_f')).toBeNull();
    const sessions = await db.select().from(schema.feishuBotSessions);
    expect(sessions[0]!.state).toBe('expired');
  });

  it('lets an admin revoke a binding but denies non-admins', async () => {
    const user = await makeUser('bind-g@example.com');
    const admin = await makeUser('bind-admin@example.com', 'admin');
    const { token } = await bindings.issueBindingToken('ou_g');
    const bound = await bindings.confirmBinding({ token, userId: user.id });

    const editorCtx: PermCtx = buildUserCtx(user.id, 'editor');
    await expect(bindings.revokeBinding(editorCtx, bound.bindingId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await bindings.revokeBinding(buildUserCtx(admin.id, 'admin'), bound.bindingId);
    expect(await bindings.getActiveBinding('ou_g')).toBeNull();
  });
});
