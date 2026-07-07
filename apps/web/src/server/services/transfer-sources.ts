import { and, eq, inArray } from 'drizzle-orm';
import type {
  TransferSourceCreate,
  TransferSourceUpdate,
  TransferSourceView,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { encryptAiJson, decryptAiJson } from '@/server/crypto/ai-encryption';
import { can, getActorUserId, type PermCtx } from '@/server/permissions';
import { DomainError } from '@/server/errors';
import { WikiJsClient } from '@/server/transfers/wikijs-client';

export type SourceTestResult =
  | { ok: true; pageCount: number }
  | { ok: false; errorCode: string; errorMessage: string };

type SourceRow = typeof schema.transferSources.$inferSelect;

export async function test(ctx: PermCtx, input: Omit<TransferSourceCreate, 'name' | 'enabled' | 'type'>): Promise<SourceTestResult> {
  assertCanManageTransfers(ctx);
  const baseUrl = normalizeTransferSourceUrl(input.baseUrl);
  const client = new WikiJsClient(baseUrl, input.apiToken, input.allowPrivateNetwork);
  try {
    const pages = await client.listPages();
    if (pages[0]) await client.getPage(pages[0].id);
    return { ok: true, pageCount: pages.length };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'SOURCE_UNAVAILABLE',
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Connection test failed',
    };
  }
}

export function assertCanManageTransfers(ctx: PermCtx): string {
  if (!can(ctx, 'manage_transfers', { kind: 'transfers' })) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to manage transfers');
  }
  const actorId = getActorUserId(ctx);
  if (!actorId) throw new DomainError('UNAUTHORIZED', 'Sign in to manage transfers');
  return actorId;
}

export function normalizeTransferSourceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError('BAD_REQUEST', 'Source URL is invalid');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new DomainError('BAD_REQUEST', 'Source URL must use HTTP(S) without credentials');
  }
  if (url.search || url.hash) {
    throw new DomainError('BAD_REQUEST', 'Source URL must not contain a query or fragment');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

function toView(row: SourceRow): TransferSourceView {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    baseUrl: row.baseUrl,
    allowPrivateNetwork: row.allowPrivateNetwork,
    hasCredentials: Boolean(row.credentialsEncrypted),
    status: row.status,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function list(ctx: PermCtx): Promise<TransferSourceView[]> {
  assertCanManageTransfers(ctx);
  const rows = await db.query.transferSources.findMany({
    orderBy: (sources, { asc }) => asc(sources.name),
  });
  return rows.map(toView);
}

export async function get(ctx: PermCtx, id: string): Promise<TransferSourceView | null> {
  assertCanManageTransfers(ctx);
  const row = await db.query.transferSources.findFirst({
    where: eq(schema.transferSources.id, id),
  });
  return row ? toView(row) : null;
}

export async function create(
  ctx: PermCtx,
  input: TransferSourceCreate,
): Promise<TransferSourceView> {
  const actorId = assertCanManageTransfers(ctx);
  const [row] = await db
    .insert(schema.transferSources)
    .values({
      type: input.type,
      name: input.name.trim(),
      baseUrl: normalizeTransferSourceUrl(input.baseUrl),
      allowPrivateNetwork: input.allowPrivateNetwork,
      credentialsEncrypted: encryptAiJson({ apiToken: input.apiToken }),
      status: input.enabled ? 'unverified' : 'disabled',
      createdBy: actorId,
      updatedBy: actorId,
    })
    .returning();
  return toView(row!);
}

export async function update(
  ctx: PermCtx,
  id: string,
  input: TransferSourceUpdate,
): Promise<TransferSourceView> {
  const actorId = assertCanManageTransfers(ctx);
  const existing = await db.query.transferSources.findFirst({
    where: eq(schema.transferSources.id, id),
  });
  if (!existing) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer source not found');
  const [row] = await db
    .update(schema.transferSources)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.baseUrl !== undefined
        ? { baseUrl: normalizeTransferSourceUrl(input.baseUrl) }
        : {}),
      ...(input.allowPrivateNetwork !== undefined
        ? { allowPrivateNetwork: input.allowPrivateNetwork }
        : {}),
      ...(input.apiToken !== undefined
        ? { credentialsEncrypted: encryptAiJson({ apiToken: input.apiToken }) }
        : {}),
      ...(input.enabled !== undefined
        ? { status: input.enabled ? 'unverified' : 'disabled' }
        : {}),
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(schema.transferSources.id, id))
    .returning();
  return toView(row!);
}

export async function remove(ctx: PermCtx, id: string): Promise<void> {
  assertCanManageTransfers(ctx);
  const active = await db.query.transferRuns.findFirst({
    where: and(
      eq(schema.transferRuns.sourceId, id),
      inArray(schema.transferRuns.status, ['queued', 'running']),
    ),
  });
  if (active) throw new DomainError('SOURCE_IN_USE', 'Transfer source is used by an active run');
  await db.delete(schema.transferSources).where(eq(schema.transferSources.id, id));
}

export async function getRuntimeSource(id: string) {
  const row = await db.query.transferSources.findFirst({
    where: eq(schema.transferSources.id, id),
  });
  if (!row) throw new DomainError('TRANSFER_NOT_FOUND', 'Transfer source not found');
  const credential = decryptAiJson<{ apiToken: string }>(row.credentialsEncrypted);
  return { ...row, apiToken: credential.apiToken };
}
