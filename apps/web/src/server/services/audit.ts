import { eq, and, desc, sql, gte, lt, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, type PermCtx } from '@/server/permissions';
import type { AuditQueryParams, AuditListResponse, AuthStatus, AuditEntryType } from '@next-wiki/shared';

export type AuditEntryInput = {
  keyId: string | null;
  userId: string | null;
  entryType: AuditEntryType;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  authStatus: AuthStatus;
  errorMessage: string | null;
};

export async function writeEntry(input: AuditEntryInput): Promise<void> {
  await db.insert(schema.apiAuditEntries).values({
    keyId: input.keyId,
    userId: input.userId,
    entryType: input.entryType,
    method: input.method,
    path: input.path,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    authStatus: input.authStatus,
    errorMessage: input.errorMessage,
  });
}

function mapStatusFilter(status: 'success' | 'error' | undefined) {
  // Success is a 2xx/3xx response; everything else (4xx/5xx, and any <200) is an
  // error. This only narrows the view — failed requests are always recorded.
  if (status === 'success') return and(
    gte(schema.apiAuditEntries.statusCode, 200),
    lt(schema.apiAuditEntries.statusCode, 400),
  );
  if (status === 'error') return or(
    gte(schema.apiAuditEntries.statusCode, 400),
    lt(schema.apiAuditEntries.statusCode, 200),
  );
  return undefined;
}

function mapEntry(row: {
  id: string;
  keyId: string | null;
  userId: string | null;
  entryType: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  authStatus: string;
  errorMessage: string | null;
  createdAt: Date;
  key: { name: string } | null;
  user: { email: string } | null;
}): AuditListResponse['entries'][number] {
  return {
    id: row.id,
    keyId: row.keyId,
    keyName: row.key?.name ?? null,
    userId: row.userId,
    userEmail: row.user?.email ?? null,
    entryType: row.entryType as AuditEntryType,
    method: row.method,
    path: row.path,
    statusCode: row.statusCode,
    durationMs: row.durationMs,
    authStatus: row.authStatus as AuthStatus,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listOwn(
  ctx: PermCtx,
  params: AuditQueryParams,
): Promise<AuditListResponse> {
  if (ctx.actor.kind !== 'user') {
    throw new DomainError('UNAUTHORIZED', 'Sign in to view audit log');
  }

  const userId = ctx.actor.userId;
  const offset = (params.page - 1) * params.pageSize;

  const conditions: SQL[] = [eq(schema.apiAuditEntries.userId, userId)];
  if (params.keyId) conditions.push(eq(schema.apiAuditEntries.keyId, params.keyId));
  if (params.entryType) conditions.push(eq(schema.apiAuditEntries.entryType, params.entryType));
  const statusFilter = mapStatusFilter(params.status);

  const where = statusFilter ? and(...conditions, statusFilter) : and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.query.apiAuditEntries.findMany({
      where,
      with: { key: { columns: { name: true } }, user: { columns: { email: true } } },
      orderBy: desc(schema.apiAuditEntries.createdAt),
      limit: params.pageSize,
      offset,
    }),
    db.$count(schema.apiAuditEntries, where),
  ]);

  return {
    entries: rows.map(mapEntry),
    total: countResult,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listAll(
  ctx: PermCtx,
  params: AuditQueryParams,
): Promise<AuditListResponse> {
  if (!can(ctx, 'manage_users', { kind: 'users' })) {
    throw new DomainError('FORBIDDEN', 'Admin access required');
  }

  const offset = (params.page - 1) * params.pageSize;
  const conditions: SQL[] = [];

  if (params.userId) conditions.push(eq(schema.apiAuditEntries.userId, params.userId));
  if (params.keyId) conditions.push(eq(schema.apiAuditEntries.keyId, params.keyId));
  if (params.method) conditions.push(eq(schema.apiAuditEntries.method, params.method));
  if (params.path) conditions.push(sql`${schema.apiAuditEntries.path} LIKE ${`${params.path}%`}`);
  if (params.startTime) conditions.push(gte(schema.apiAuditEntries.createdAt, params.startTime));
  if (params.endTime) conditions.push(lte(schema.apiAuditEntries.createdAt, params.endTime));
  if (params.entryType) conditions.push(eq(schema.apiAuditEntries.entryType, params.entryType));

  const statusFilter = mapStatusFilter(params.status);
  if (statusFilter) conditions.push(statusFilter);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.query.apiAuditEntries.findMany({
      where,
      with: { key: { columns: { name: true } }, user: { columns: { email: true } } },
      orderBy: desc(schema.apiAuditEntries.createdAt),
      limit: params.pageSize,
      offset,
    }),
    db.$count(schema.apiAuditEntries, where),
  ]);

  return {
    entries: rows.map(mapEntry),
    total: countResult,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listAllSafe(ctx: PermCtx): Promise<AuditListResponse | null> {
  if (!can(ctx, 'manage_users', { kind: 'users' })) return null;
  return listAll(ctx, { page: 1, pageSize: 20 });
}
