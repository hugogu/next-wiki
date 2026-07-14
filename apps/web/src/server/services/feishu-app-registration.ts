import { and, eq, gt } from 'drizzle-orm';
import {
  feishuRegistrationStartInputSchema,
  type FeishuRegistrationDomain,
} from '@next-wiki/shared';
import { decryptKey, encryptKey } from '@/server/crypto/key-encryption';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { pollAppRegistration, startAppRegistration } from '@/server/feishu/app-registration';
import { startFeishuLongConnection } from '@/server/feishu/long-connection';
import type { PermCtx } from '@/server/permissions';
import { assertCanManageFeishu, updateConfig } from './feishu-config';

type RegistrationSession = typeof schema.feishuAppRegistrationSessions.$inferSelect;

function registrationOwnerId(ctx: PermCtx): string {
  assertCanManageFeishu(ctx);
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('FORBIDDEN', 'Feishu registration requires an administrator session');
  }
  return ctx.actor.userId;
}

function toSessionView(session: RegistrationSession) {
  return {
    registrationId: session.id,
    domain: session.domain as FeishuRegistrationDomain,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function beginFeishuAppRegistration(
  ctx: PermCtx,
  input: { domain?: FeishuRegistrationDomain },
) {
  const userId = registrationOwnerId(ctx);
  const parsed = feishuRegistrationStartInputSchema.parse(input);
  const domain = parsed.domain ?? 'feishu';
  let started;
  try {
    started = await startAppRegistration(domain);
  } catch {
    throw new DomainError('PROVIDER_UNAVAILABLE', 'Unable to start Feishu QR registration');
  }

  const expiresAt = new Date(Date.now() + started.expiresInSeconds * 1000);
  const [session] = await db
    .insert(schema.feishuAppRegistrationSessions)
    .values({
      createdBy: userId,
      domain,
      deviceCodeEncrypted: encryptKey(started.deviceCode),
      expiresAt,
    })
    .returning();

  return {
    ...toSessionView(session!),
    qrUrl: started.qrUrl,
    pollIntervalSeconds: started.pollIntervalSeconds,
  };
}

async function getActiveSession(
  ctx: PermCtx,
  registrationId: string,
): Promise<RegistrationSession> {
  const userId = registrationOwnerId(ctx);
  const session = await db.query.feishuAppRegistrationSessions.findFirst({
    where: and(
      eq(schema.feishuAppRegistrationSessions.id, registrationId),
      eq(schema.feishuAppRegistrationSessions.createdBy, userId),
      gt(schema.feishuAppRegistrationSessions.expiresAt, new Date()),
    ),
  });
  if (!session)
    throw new DomainError('NOT_FOUND', 'Feishu QR registration has expired or is unavailable');
  return session;
}

export async function checkFeishuAppRegistration(ctx: PermCtx, registrationId: string) {
  const session = await getActiveSession(ctx, registrationId);
  let result;
  try {
    result = await pollAppRegistration(
      session.domain as FeishuRegistrationDomain,
      decryptKey(session.deviceCodeEncrypted),
    );
  } catch {
    throw new DomainError('PROVIDER_UNAVAILABLE', 'Unable to check Feishu QR registration');
  }

  if (result.status === 'pending') {
    await db
      .update(schema.feishuAppRegistrationSessions)
      .set({ lastPolledAt: new Date() })
      .where(eq(schema.feishuAppRegistrationSessions.id, session.id));
    return { status: 'pending' as const, expiresAt: session.expiresAt.toISOString() };
  }

  if (result.status === 'completed') {
    await updateConfig(ctx, { appId: result.appId, appSecret: result.appSecret, enabled: true });
    await startFeishuLongConnection();
    await db
      .delete(schema.feishuAppRegistrationSessions)
      .where(eq(schema.feishuAppRegistrationSessions.id, session.id));
    return { status: 'completed' as const, appId: result.appId };
  }
  await db
    .delete(schema.feishuAppRegistrationSessions)
    .where(eq(schema.feishuAppRegistrationSessions.id, session.id));
  if (result.status === 'denied' || result.status === 'expired') return result;
  throw new DomainError('PROVIDER_UNAVAILABLE', result.message);
}

export async function cancelFeishuAppRegistration(
  ctx: PermCtx,
  registrationId: string,
): Promise<void> {
  const session = await getActiveSession(ctx, registrationId);
  await db
    .delete(schema.feishuAppRegistrationSessions)
    .where(eq(schema.feishuAppRegistrationSessions.id, session.id));
}
