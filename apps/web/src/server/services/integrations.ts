import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import {
  integrationUpsertSchema,
  type IntegrationKind,
  type IntegrationUpsertInput,
  type IntegrationView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { can, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { decryptKey, encryptKey } from '@/server/crypto/key-encryption';

const execFileAsync = promisify(execFile);

type IntegrationRow = typeof schema.integrations.$inferSelect;

/**
 * Credentials for external services, owned by no single feature.
 *
 * Git export and static site publishing both reach the same GitHub account.
 * Holding one credential per feature would mean two deploy keys to install —
 * which hosts reject anyway, since deploy-key uniqueness is enforced globally —
 * and two places to rotate. Those features stay independent in the sense that
 * matters: neither's settings, schedule, state, or artifact affects the other.
 *
 * One row per kind: a credential identifies an account, and a deployment has
 * one account per service.
 */

export function assertCanManageIntegrations(ctx: PermCtx): void {
  // Same authority as static site publishing: a credential that can push to the
  // wiki's repositories is as consequential as the features that use it.
  if (!can(ctx, 'manage_static_site', { kind: 'static_site' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage integrations');
  }
}

/** The secret is represented by `hasSecret` and never returned. */
function toView(row: IntegrationRow): IntegrationView {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    authMode: row.authMode,
    username: row.username,
    hasSecret: row.secretEncrypted !== null,
    publicKey: row.publicKey,
    fingerprint: row.fingerprint,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findIntegration(kind: IntegrationKind): Promise<IntegrationRow | undefined> {
  return db.query.integrations.findFirst({ where: eq(schema.integrations.kind, kind) });
}

export async function getIntegration(
  ctx: PermCtx,
  kind: IntegrationKind,
): Promise<IntegrationView | null> {
  assertCanManageIntegrations(ctx);
  const row = await findIntegration(kind);
  return row ? toView(row) : null;
}

export async function listIntegrations(ctx: PermCtx): Promise<IntegrationView[]> {
  assertCanManageIntegrations(ctx);
  const rows = await db.query.integrations.findMany();
  return rows.map(toView);
}

export async function configureIntegration(
  ctx: PermCtx,
  input: IntegrationUpsertInput,
): Promise<IntegrationView> {
  assertCanManageIntegrations(ctx);
  const parsed = integrationUpsertSchema.parse(input);
  const existing = await findIntegration(parsed.kind);

  // Switching auth mode invalidates a credential of the other kind, so it is
  // dropped rather than left to fail confusingly at push time.
  const authModeChanged = existing != null && existing.authMode !== parsed.authMode;
  if (!parsed.secret && !existing?.secretEncrypted) {
    throw new DomainError('BAD_REQUEST', 'A credential is required');
  }
  if (!parsed.secret && authModeChanged) {
    throw new DomainError(
      'BAD_REQUEST',
      'Changing the authentication method needs a new credential',
    );
  }

  const values = {
    kind: parsed.kind,
    label: parsed.label ?? null,
    authMode: parsed.authMode,
    username: parsed.username ?? null,
    ...(parsed.secret ? { secretEncrypted: encryptKey(parsed.secret) } : {}),
    ...(authModeChanged ? { publicKey: null, fingerprint: null } : {}),
    updatedAt: new Date(),
  };

  const [row] = existing
    ? await db
        .update(schema.integrations)
        .set(values)
        .where(eq(schema.integrations.id, existing.id))
        .returning()
    : await db.insert(schema.integrations).values(values).returning();
  if (!row) throw new Error('Failed to save integration');
  return toView(row);
}

/**
 * Remove a credential.
 *
 * Refused while a feature still points at it: silently breaking publishing is
 * worse than making the operator disconnect it first. The FK is `ON DELETE
 * restrict` for the same reason; this check exists to turn that into a readable
 * error rather than a constraint violation.
 */
export async function deleteIntegration(ctx: PermCtx, kind: IntegrationKind): Promise<void> {
  assertCanManageIntegrations(ctx);
  const row = await findIntegration(kind);
  if (!row) return;

  const inUse = await db.query.staticSiteTargets.findFirst({
    where: eq(schema.staticSiteTargets.integrationId, row.id),
  });
  if (inUse) {
    throw new DomainError(
      'BAD_REQUEST',
      'Static site publishing still uses this credential. Remove that configuration first.',
    );
  }

  await db.delete(schema.integrations).where(eq(schema.integrations.id, row.id));
}

/**
 * Generate an SSH keypair for this integration.
 *
 * The public half is shown once so the operator can install it as a deploy key.
 * Because the credential is shared, that installation happens once no matter how
 * many features use the repository.
 */
export async function generateSshKey(
  ctx: PermCtx,
  kind: IntegrationKind,
): Promise<{ publicKey: string; fingerprint: string }> {
  assertCanManageIntegrations(ctx);
  const directory = await mkdtemp(join(tmpdir(), 'next-wiki-integration-key-'));
  const privateKeyPath = join(directory, 'id_ed25519');

  try {
    await execFileAsync('ssh-keygen', [
      '-q',
      '-t',
      'ed25519',
      '-N',
      '',
      '-C',
      `next-wiki-${kind}`,
      '-f',
      privateKeyPath,
    ]);
    const privateKey = await readFile(privateKeyPath, 'utf8');
    const publicKey = (await readFile(`${privateKeyPath}.pub`, 'utf8')).trim();
    const { stdout } = await execFileAsync('ssh-keygen', ['-lf', `${privateKeyPath}.pub`]);
    const fingerprint = stdout.trim().split(/\s+/)[1] ?? stdout.trim();

    const existing = await findIntegration(kind);
    const values = {
      kind,
      authMode: 'ssh' as const,
      publicKey,
      fingerprint,
      secretEncrypted: encryptKey(privateKey),
      updatedAt: new Date(),
    };
    if (existing) {
      await db
        .update(schema.integrations)
        .set(values)
        .where(eq(schema.integrations.id, existing.id));
    } else {
      await db.insert(schema.integrations).values(values);
    }
    return { publicKey, fingerprint };
  } catch (error) {
    throw new DomainError(
      'STORAGE_UNAVAILABLE',
      `Failed to generate SSH key: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Decrypted credential for a job that needs to authenticate.
 *
 * Server-only and deliberately not exposed through any view or route.
 */
export async function resolveCredential(kind: IntegrationKind): Promise<{
  authMode: 'https_token' | 'ssh';
  username: string | null;
  secret: string;
} | null> {
  const row = await findIntegration(kind);
  if (!row?.secretEncrypted) return null;
  return {
    authMode: row.authMode,
    username: row.username,
    secret: decryptKey(row.secretEncrypted),
  };
}
