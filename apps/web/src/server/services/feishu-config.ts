import { eq } from 'drizzle-orm';
import { feishuConfigInputSchema, type FeishuConfigInput, type FeishuConfigView } from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { encryptKey, decryptKey } from '@/server/crypto/key-encryption';

const CONFIG_ID = 'default';

type ConfigRow = typeof schema.feishuIntegrationConfig.$inferSelect;

/**
 * Feishu configuration is administered through the AI/admin surface. Reuse the
 * existing `manage_ai` admin capability rather than adding a parallel role.
 */
export function isFeishuAdmin(ctx: PermCtx): boolean {
  return can(ctx, 'manage_ai', { kind: 'ai_settings' });
}

export function assertCanManageFeishu(ctx: PermCtx): void {
  if (!isFeishuAdmin(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage the Feishu integration');
  }
}

/** Fetch the singleton config row, lazily creating the default disabled row. */
async function getOrCreateRow(): Promise<ConfigRow> {
  const existing = await db.query.feishuIntegrationConfig.findFirst({
    where: eq(schema.feishuIntegrationConfig.id, CONFIG_ID),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(schema.feishuIntegrationConfig)
    .values({ id: CONFIG_ID })
    .onConflictDoNothing()
    .returning();
  return (
    created ??
    (await db.query.feishuIntegrationConfig.findFirst({
      where: eq(schema.feishuIntegrationConfig.id, CONFIG_ID),
    }))!
  );
}

function toView(row: ConfigRow): FeishuConfigView {
  return {
    enabled: row.enabled,
    appId: row.appId,
    hasAppSecret: row.appSecretEncrypted !== null,
    hasEncryptKey: row.encryptKeyEncrypted !== null,
    hasVerificationToken: row.verificationTokenEncrypted !== null,
    connectionMode: row.connectionMode,
    userRateLimitPerMinute: row.userRateLimitPerMinute,
    chatRateLimitPerMinute: row.chatRateLimitPerMinute,
    notificationRetentionHours: row.notificationRetentionHours,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

/** Masked configuration view for admins — never returns a plaintext secret. */
export async function getConfigView(ctx: PermCtx): Promise<FeishuConfigView> {
  assertCanManageFeishu(ctx);
  return toView(await getOrCreateRow());
}

/**
 * Apply an admin configuration update. Secrets are write-only: a field is
 * (re)encrypted only when present in the input; omitting it preserves the
 * stored ciphertext. Enabling requires an app id, app secret, and Encrypt Key
 * to be present (either supplied now or already stored).
 */
export async function updateConfig(ctx: PermCtx, input: FeishuConfigInput): Promise<FeishuConfigView> {
  assertCanManageFeishu(ctx);
  const parsed = feishuConfigInputSchema.parse(input);
  const row = await getOrCreateRow();

  const next: Partial<typeof schema.feishuIntegrationConfig.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.appId !== undefined) next.appId = parsed.appId;
  if (parsed.appSecret !== undefined) next.appSecretEncrypted = encryptKey(parsed.appSecret);
  if (parsed.encryptKey !== undefined) next.encryptKeyEncrypted = encryptKey(parsed.encryptKey);
  if (parsed.verificationToken !== undefined) {
    next.verificationTokenEncrypted = encryptKey(parsed.verificationToken);
  }
  if (parsed.userRateLimitPerMinute !== undefined) {
    next.userRateLimitPerMinute = parsed.userRateLimitPerMinute;
  }
  if (parsed.chatRateLimitPerMinute !== undefined) {
    next.chatRateLimitPerMinute = parsed.chatRateLimitPerMinute;
  }
  if (parsed.notificationRetentionHours !== undefined) {
    next.notificationRetentionHours = parsed.notificationRetentionHours;
  }

  const willEnable = parsed.enabled ?? row.enabled;
  if (willEnable) {
    const appId = next.appId ?? row.appId;
    const hasSecret = next.appSecretEncrypted !== undefined || row.appSecretEncrypted !== null;
    const hasEncrypt = next.encryptKeyEncrypted !== undefined || row.encryptKeyEncrypted !== null;
    if (!appId || !hasSecret || !hasEncrypt) {
      throw new DomainError(
        'BAD_REQUEST',
        'Enabling Feishu requires an app id, app secret, and Event v2 Encrypt Key',
      );
    }
  }
  if (parsed.enabled !== undefined) next.enabled = parsed.enabled;

  const [updated] = await db
    .update(schema.feishuIntegrationConfig)
    .set(next)
    .where(eq(schema.feishuIntegrationConfig.id, CONFIG_ID))
    .returning();
  return toView(updated!);
}

export type DecryptedFeishuConfig = {
  appId: string;
  appSecret: string;
  encryptKey: string;
  verificationToken: string | null;
  userRateLimitPerMinute: number;
  chatRateLimitPerMinute: number;
  notificationRetentionHours: number;
};

/**
 * In-process accessor for the decrypted runtime configuration. Used by the
 * webhook route and transport client — never exposed through any HTTP response.
 * Returns null when the integration is disabled or missing required secrets, so
 * callers treat an unconfigured deployment as simply inactive.
 */
export async function getDecryptedConfig(): Promise<DecryptedFeishuConfig | null> {
  const row = await db.query.feishuIntegrationConfig.findFirst({
    where: eq(schema.feishuIntegrationConfig.id, CONFIG_ID),
  });
  if (!row || !row.enabled) return null;
  if (!row.appId || !row.appSecretEncrypted || !row.encryptKeyEncrypted) return null;
  return {
    appId: row.appId,
    appSecret: decryptKey(row.appSecretEncrypted),
    encryptKey: decryptKey(row.encryptKeyEncrypted),
    verificationToken: row.verificationTokenEncrypted
      ? decryptKey(row.verificationTokenEncrypted)
      : null,
    userRateLimitPerMinute: row.userRateLimitPerMinute,
    chatRateLimitPerMinute: row.chatRateLimitPerMinute,
    notificationRetentionHours: row.notificationRetentionHours,
  };
}

/** Whether the integration is currently enabled and fully configured. */
export async function isFeishuConfigured(): Promise<boolean> {
  return (await getDecryptedConfig()) !== null;
}

/** Record a connection/error health signal (bounded, no secrets). */
export async function recordHealth(signal: { connectedAt?: Date; error?: string | null }): Promise<void> {
  await db
    .update(schema.feishuIntegrationConfig)
    .set({
      ...(signal.connectedAt ? { lastConnectedAt: signal.connectedAt } : {}),
      ...(signal.error !== undefined ? { lastError: signal.error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.feishuIntegrationConfig.id, CONFIG_ID));
}
