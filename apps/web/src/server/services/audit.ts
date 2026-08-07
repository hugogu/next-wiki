import { eq, and, desc, sql, gte, lt, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { DomainError } from '@/server/errors';
import { can, type PermCtx } from '@/server/permissions';
import { requestLogSettingsAuditMetadataSchema } from '@next-wiki/shared';
import type {
  AuditQueryParams,
  AuditListResponse,
  AuthStatus,
  AuditEntryType,
  AuditOrigin,
  RequestLogSettingsAuditMetadata,
} from '@next-wiki/shared';

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
  /** Source IP; optional so existing callers/tests need not supply it. */
  ip?: string | null;
  /** Source channel (019). Defaults to `web` when omitted. */
  origin?: AuditOrigin;
  /** Non-secret Feishu correlation id; never a raw prompt/answer/secret. */
  externalCorrelationId?: string | null;
  metadata?: RequestLogSettingsAuditMetadata | null;
};

/**
 * Resolve the client's source IP from proxy headers. `cf-connecting-ip` is
 * checked first: when Cloudflare proxies the request, our own Caddy
 * reverse_proxy (docker/caddy/Caddyfile) has no `trusted_proxies` configured,
 * so it overwrites `x-forwarded-for` with its immediate peer — Cloudflare's
 * anycast edge node, which differs per request/colo — rather than the
 * original client. `cf-connecting-ip` is untouched by Caddy and always holds
 * the true client IP for Cloudflare-proxied traffic. Falls back to
 * `x-forwarded-for` (first entry of the chain), then `x-real-ip`, for
 * deployments not behind Cloudflare. Returns null when none are present
 * (e.g. direct local requests without a proxy).
 */
export function clientIp(headers: Headers): string | null {
  const cfConnectingIp = headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || null;
}

export async function writeEntry(input: AuditEntryInput): Promise<void> {
  await db.insert(schema.apiAuditEntries).values({
    keyId: input.keyId,
    userId: input.userId,
    entryType: input.entryType,
    origin: input.origin ?? 'web',
    externalCorrelationId: input.externalCorrelationId ?? null,
    metadata: input.metadata ?? null,
    method: input.method,
    path: input.path,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    authStatus: input.authStatus,
    errorMessage: input.errorMessage,
    ip: input.ip ?? null,
  });
}

/**
 * 026: bounded audit trail for governed tool operations. Tool policy changes,
 * tool calls, proposal decisions, proposal applies, and immediate mutations
 * happen partly inside the async worker (no HTTP request of their own), so they
 * are recorded here as `api` entries with a descriptive synthetic path — the
 * same shape the Feishu delegation path already uses — keeping them visible in
 * the unified admin audit log alongside the durable domain records.
 */
async function writeToolAuditEntry(input: {
  userId: string | null;
  method: string;
  action: string;
  outcome: 'success' | 'error';
  detail?: string | null;
}): Promise<void> {
  await writeEntry({
    keyId: null,
    userId: input.userId,
    entryType: 'api',
    method: input.method,
    path: `/internal/ai/tools/${input.action}`,
    statusCode: input.outcome === 'error' ? 500 : 200,
    durationMs: 0,
    authStatus: 'authenticated',
    errorMessage: input.outcome === 'error' ? (input.detail?.slice(0, 500) ?? null) : null,
  });
}

/**
 * Agent Skill administration (028). Skills are configuration that steers the
 * assistant, so every change to which ones exist, which are enabled, and what
 * they say is auditable — the same bar as tool policy.
 */
export function auditSkillChange(
  userId: string | null,
  change: { action: string; name: string; path?: string | null },
): Promise<void> {
  return writeToolAuditEntry({
    userId,
    method: 'PATCH',
    action: `skills/${change.name}/${change.action}${change.path ? `/${change.path}` : ''}`,
    outcome: 'success',
  });
}

export function auditToolPolicyChange(
  userId: string | null,
  scope: { providerKey: string; category?: string | null; toolName?: string | null },
): Promise<void> {
  const target = scope.toolName ?? scope.category ?? 'provider-default';
  return writeToolAuditEntry({
    userId,
    method: 'PATCH',
    action: `policy/${scope.providerKey}/${target}`,
    outcome: 'success',
  });
}

export function auditToolCall(
  userId: string | null,
  call: { toolName: string; status: string; errorCode?: string | null },
): Promise<void> {
  return writeToolAuditEntry({
    userId,
    method: 'POST',
    action: `call/${call.toolName}/${call.status}`,
    outcome: call.status === 'failed' || call.status === 'blocked' ? 'error' : 'success',
    detail: call.errorCode ?? null,
  });
}

export function auditProposalDecision(
  userId: string | null,
  decision: { proposalId: string; decision: 'approved' | 'rejected' },
): Promise<void> {
  return writeToolAuditEntry({
    userId,
    method: 'POST',
    action: `proposal/${decision.proposalId}/${decision.decision}`,
    outcome: 'success',
  });
}

export function auditProposalApply(
  userId: string | null,
  result: { proposalId: string; applied: number; failed: number },
): Promise<void> {
  return writeToolAuditEntry({
    userId,
    method: 'POST',
    action: `proposal/${result.proposalId}/apply/${result.applied}-${result.failed}`,
    outcome: result.failed > 0 ? 'error' : 'success',
  });
}

export function auditImmediateToolMutation(
  userId: string | null,
  mutation: { toolName: string; target: string },
): Promise<void> {
  return writeToolAuditEntry({
    userId,
    method: 'POST',
    action: `immediate/${mutation.toolName}/${mutation.target}`,
    outcome: 'success',
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
  origin: string;
  externalCorrelationId: string | null;
  metadata: unknown;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  authStatus: string;
  errorMessage: string | null;
  ip: string | null;
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
    origin: row.origin as AuditOrigin,
    externalCorrelationId: row.externalCorrelationId,
    metadata: requestLogSettingsAuditMetadataSchema.safeParse(row.metadata).data ?? null,
    method: row.method,
    path: row.path,
    statusCode: row.statusCode,
    durationMs: row.durationMs,
    authStatus: row.authStatus as AuthStatus,
    errorMessage: row.errorMessage,
    ip: row.ip,
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
  if (params.origin) conditions.push(eq(schema.apiAuditEntries.origin, params.origin));

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
