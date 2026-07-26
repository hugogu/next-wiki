import { and, desc, eq, gt, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type {
  OutboundRequestOutcome,
  OutboundRequestSource,
  RequestLogBody,
  RequestLogDetail,
  RequestLogHeader,
  RequestLogLevel,
  RequestLogListQuery,
  RequestLogListResponse,
  RequestLogSettingsView,
  RequestLogSummary,
  UpdateRequestLogSettings,
} from '@next-wiki/shared';
import { db } from '@/server/db';
import * as schema from '@/server/db/schema';
import { encryptAiJson, decryptAiJson } from '@/server/crypto/ai-encryption';
import { DomainError } from '@/server/errors';
import { can, type PermCtx } from '@/server/permissions';
import { enqueue, QUEUES } from '@/server/jobs/runtime';

const DEFAULT_SETTINGS = { enabled: false, level: 'status' as const, retentionHours: 24 };
const MAX_SAFE_ERROR_LENGTH = 500;

export const OUTBOUND_REQUEST_SOURCE_REGISTRY = {
  ai: new Set([
    'models',
    'chat.completions',
    'embeddings',
    'images.generations',
    'messages',
    'image_generation',
  ]),
} as const;

export type RequestLogSettingsAuditMetadata = {
  kind: 'request_log_settings_change';
  previous: { enabled: boolean; level: RequestLogLevel; retentionHours: number };
  next: { enabled: boolean; level: RequestLogLevel; retentionHours: number };
};

type CaptureInput = {
  source: OutboundRequestSource;
  method: string;
  target: string;
  requestHeaders?: HeadersInit;
  requestBody?: BodyInit | null;
};

type CaptureCompletion = {
  response?: Response;
  outcome: OutboundRequestOutcome;
  error?: unknown;
  providerRequestId?: string;
};

type PersistedPayload = {
  id: string;
  sourceType: string;
  providerKey?: string;
  operation: string;
  attempt: number;
  method: string;
  targetHost?: string;
  targetPath?: string;
  statusCode?: number;
  outcome: OutboundRequestOutcome;
  errorCode?: string;
  errorMessage?: string;
  providerRequestId?: string;
  correlationId?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  captureLevel: RequestLogLevel;
  expiresAt: string;
  targetEncrypted?: string;
  requestHeadersEncrypted?: string;
  responseHeadersEncrypted?: string;
  requestBodyEncrypted?: string;
  responseBodyEncrypted?: string;
  errorDetailEncrypted?: string;
};

function requireAdmin(ctx: PermCtx): void {
  if (!can(ctx, 'manage_request_logs', { kind: 'request_logs' })) {
    throw new DomainError('FORBIDDEN', 'Admin access required');
  }
}

function headersToPairs(headers: HeadersInit | undefined): RequestLogHeader[] {
  if (!headers) return [];
  const result = new Map<string, string[]>();
  const add = (name: string, value: string) => {
    const values = result.get(name) ?? [];
    values.push(value);
    result.set(name, values);
  };
  if (headers instanceof Headers) {
    headers.forEach((value, name) => add(name, value));
  } else if (Array.isArray(headers)) {
    for (const [name, value] of headers) add(name, value);
  } else {
    for (const [name, value] of Object.entries(headers)) add(name, value);
  }
  return [...result.entries()].map(([name, values]) => ({ name, values }));
}

function bodyFromInput(
  body: BodyInit | null | undefined,
  headers: HeadersInit | undefined,
): RequestLogBody | null {
  if (body === undefined || body === null) return null;
  const contentType = new Headers(headers).get('content-type');
  if (typeof body === 'string') {
    return {
      encoding: 'utf8',
      contentType,
      contentEncoding: null,
      byteLength: Buffer.byteLength(body),
      data: body,
    };
  }
  if (body instanceof URLSearchParams) {
    const data = body.toString();
    return {
      encoding: 'utf8',
      contentType,
      contentEncoding: null,
      byteLength: Buffer.byteLength(data),
      data,
    };
  }
  return null;
}

async function bodyFromResponse(response: Response): Promise<RequestLogBody | null> {
  if (!response.body) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type');
  const contentEncoding = response.headers.get('content-encoding');
  const isText = /^text\/|json|xml|javascript|x-www-form-urlencoded/i.test(contentType ?? '');
  return {
    encoding: isText ? 'utf8' : 'base64',
    contentType,
    contentEncoding,
    byteLength: bytes.length,
    data: isText ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString('base64'),
  };
}

function safeError(error: unknown): {
  code?: string;
  message?: string;
  detail?: Record<string, unknown>;
} {
  if (!error || typeof error !== 'object') return {};
  const value = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    detail?: unknown;
    stack?: unknown;
    cause?: unknown;
  };
  // The summary column is deliberately non-sensitive. Detailed diagnostic
  // context (including the provider message/stack) is encrypted and only
  // retained at All level, never copied into the broadly visible list view.
  const message =
    typeof value.name === 'string'
      ? `${value.name} failed`.slice(0, MAX_SAFE_ERROR_LENGTH)
      : 'Outbound request failed';
  const code =
    typeof value.code === 'string'
      ? value.code.slice(0, 120)
      : typeof value.name === 'string'
        ? value.name.slice(0, 120)
        : undefined;
  const detail: Record<string, unknown> = {
    name: typeof value.name === 'string' ? value.name : undefined,
    code,
    message:
      typeof value.message === 'string' ? value.message.slice(0, MAX_SAFE_ERROR_LENGTH) : undefined,
    stack: typeof value.stack === 'string' ? value.stack : undefined,
    cause:
      value.cause instanceof Error
        ? { name: value.cause.name, message: value.cause.message }
        : undefined,
    provider: value.detail,
  };
  return { code, message, detail };
}

function sourceIsRegistered(source: OutboundRequestSource): boolean {
  const operations =
    OUTBOUND_REQUEST_SOURCE_REGISTRY[
      source.sourceType as keyof typeof OUTBOUND_REQUEST_SOURCE_REGISTRY
    ];
  return Boolean(operations?.has(source.operation));
}

async function readEffectiveSettings() {
  const row = await db.query.requestLogSettings.findFirst({
    where: eq(schema.requestLogSettings.id, 'default'),
  });
  return row
    ? {
        enabled: row.enabled,
        level: row.level as RequestLogLevel,
        retentionHours: row.retentionHours,
      }
    : DEFAULT_SETTINGS;
}

function mapSettings(
  row: typeof schema.requestLogSettings.$inferSelect | undefined,
): RequestLogSettingsView {
  return {
    enabled: row?.enabled ?? DEFAULT_SETTINGS.enabled,
    level: (row?.level as RequestLogLevel | undefined) ?? DEFAULT_SETTINGS.level,
    retentionHours: row?.retentionHours ?? DEFAULT_SETTINGS.retentionHours,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    updatedBy: null,
    allConfirmationRequired: true,
  };
}

export async function getRequestLogSettings(ctx: PermCtx): Promise<RequestLogSettingsView> {
  requireAdmin(ctx);
  const row = await db.query.requestLogSettings.findFirst({
    where: eq(schema.requestLogSettings.id, 'default'),
    with: { updatedByUser: { columns: { id: true, email: true } } },
  });
  return {
    ...mapSettings(row),
    updatedBy: row?.updatedByUser
      ? { id: row.updatedByUser.id, email: row.updatedByUser.email }
      : null,
  };
}

export async function updateRequestLogSettings(
  ctx: PermCtx,
  input: UpdateRequestLogSettings,
): Promise<{ settings: RequestLogSettingsView; auditMetadata: RequestLogSettingsAuditMetadata }> {
  requireAdmin(ctx);
  if (ctx.actor.kind !== 'user') throw new DomainError('FORBIDDEN', 'Admin session required');
  if (input.enabled && input.level === 'all' && input.confirmSensitiveCapture !== true) {
    throw new DomainError('BAD_REQUEST', 'Confirmation is required for All capture');
  }
  const current = await readEffectiveSettings();
  const now = new Date();
  const [row] = await db
    .insert(schema.requestLogSettings)
    .values({
      id: 'default',
      enabled: input.enabled,
      level: input.level,
      retentionHours: input.retentionHours,
      updatedBy: ctx.actor.userId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.requestLogSettings.id,
      set: {
        enabled: input.enabled,
        level: input.level,
        retentionHours: input.retentionHours,
        updatedBy: ctx.actor.userId,
        updatedAt: now,
      },
    })
    .returning();
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, ctx.actor.userId),
    columns: { id: true, email: true },
  });
  return {
    settings: {
      ...mapSettings(row),
      updatedBy: user ? { id: user.id, email: user.email } : null,
    },
    auditMetadata: {
      kind: 'request_log_settings_change',
      previous: current,
      next: { enabled: input.enabled, level: input.level, retentionHours: input.retentionHours },
    },
  };
}

export async function beginOutboundRequestCapture(
  input: CaptureInput,
): Promise<((completion: CaptureCompletion) => void) | null> {
  if (!sourceIsRegistered(input.source)) return null;
  const settings = await readEffectiveSettings().catch(() => DEFAULT_SETTINGS);
  if (!settings.enabled) return null;
  const startedAt = new Date();
  const id = randomUUID();
  const requestHeaders = headersToPairs(input.requestHeaders);
  const requestBody =
    settings.level === 'all' ? bodyFromInput(input.requestBody, input.requestHeaders) : null;
  const target = new URL(input.target);

  return (completion) => {
    void (async () => {
      try {
        const completedAt = new Date();
        const response = completion.response;
        const responseHeaders = response ? headersToPairs(response.headers) : null;
        const responseBody =
          settings.level === 'all' && response ? await bodyFromResponse(response.clone()) : null;
        const error = safeError(completion.error);
        const expiresAt = new Date(
          (completedAt.getTime() || startedAt.getTime()) + settings.retentionHours * 60 * 60 * 1000,
        );
        const payload: PersistedPayload = {
          id,
          sourceType: input.source.sourceType,
          providerKey: input.source.providerKey,
          operation: input.source.operation,
          attempt: input.source.attempt ?? 1,
          method: input.method.toUpperCase(),
          targetHost: target.host || undefined,
          targetPath: target.pathname || undefined,
          statusCode: response?.status,
          outcome: completion.outcome,
          errorCode: error.code,
          errorMessage: error.message,
          providerRequestId: completion.providerRequestId,
          correlationId: input.source.correlationId,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          captureLevel: settings.level,
          expiresAt: expiresAt.toISOString(),
        };
        if (settings.level !== 'status') {
          payload.targetEncrypted = encryptAiJson(target.toString());
          payload.requestHeadersEncrypted = encryptAiJson(requestHeaders);
          payload.responseHeadersEncrypted = responseHeaders
            ? encryptAiJson(responseHeaders)
            : undefined;
        }
        if (settings.level === 'all') {
          payload.requestBodyEncrypted = requestBody ? encryptAiJson(requestBody) : undefined;
          payload.responseBodyEncrypted = responseBody ? encryptAiJson(responseBody) : undefined;
          payload.errorDetailEncrypted = error.detail ? encryptAiJson(error.detail) : undefined;
        }
        await enqueue(QUEUES.requestLogPersist, payload as unknown as Record<string, unknown>, {
          id,
        });
      } catch {
        // Capture is intentionally best effort; never surface raw data or alter the source operation.
      }
    })();
  };
}

export async function persistOutboundRequestLog(payload: PersistedPayload): Promise<void> {
  await db
    .insert(schema.outboundRequestLogs)
    .values({
      id: payload.id,
      sourceType: payload.sourceType,
      providerKey: payload.providerKey ?? null,
      operation: payload.operation,
      attempt: payload.attempt,
      method: payload.method,
      targetHost: payload.targetHost ?? null,
      targetPath: payload.targetPath ?? null,
      statusCode: payload.statusCode ?? null,
      outcome: payload.outcome,
      errorCode: payload.errorCode ?? null,
      errorMessage: payload.errorMessage ?? null,
      providerRequestId: payload.providerRequestId ?? null,
      correlationId: payload.correlationId ?? null,
      startedAt: new Date(payload.startedAt),
      completedAt: new Date(payload.completedAt),
      durationMs: payload.durationMs,
      captureLevel: payload.captureLevel,
      targetEncrypted: payload.targetEncrypted ?? null,
      requestHeadersEncrypted: payload.requestHeadersEncrypted ?? null,
      responseHeadersEncrypted: payload.responseHeadersEncrypted ?? null,
      requestBodyEncrypted: payload.requestBodyEncrypted ?? null,
      responseBodyEncrypted: payload.responseBodyEncrypted ?? null,
      errorDetailEncrypted: payload.errorDetailEncrypted ?? null,
      expiresAt: new Date(payload.expiresAt),
    })
    .onConflictDoNothing({ target: schema.outboundRequestLogs.id });
}

function mapSummary(row: typeof schema.outboundRequestLogs.$inferSelect): RequestLogSummary {
  return {
    id: row.id,
    sourceType: row.sourceType,
    providerKey: row.providerKey,
    operation: row.operation,
    attempt: row.attempt,
    method: row.method,
    targetHost: row.targetHost,
    targetPath: row.targetPath,
    statusCode: row.statusCode,
    outcome: row.outcome as OutboundRequestOutcome,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    providerRequestId: row.providerRequestId,
    correlationId: row.correlationId,
    durationMs: row.durationMs,
    captureLevel: row.captureLevel as RequestLogLevel,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function listRequestLogs(
  ctx: PermCtx,
  query: RequestLogListQuery,
): Promise<RequestLogListResponse> {
  requireAdmin(ctx);
  const now = new Date();
  const where = and(
    gt(schema.outboundRequestLogs.expiresAt, now),
    query.startTime ? gte(schema.outboundRequestLogs.createdAt, query.startTime) : undefined,
    query.endTime ? lte(schema.outboundRequestLogs.createdAt, query.endTime) : undefined,
    query.sourceType ? eq(schema.outboundRequestLogs.sourceType, query.sourceType) : undefined,
    query.providerKey ? eq(schema.outboundRequestLogs.providerKey, query.providerKey) : undefined,
    query.operation ? eq(schema.outboundRequestLogs.operation, query.operation) : undefined,
    query.outcome ? eq(schema.outboundRequestLogs.outcome, query.outcome) : undefined,
    query.statusCode ? eq(schema.outboundRequestLogs.statusCode, query.statusCode) : undefined,
    query.correlationId
      ? eq(schema.outboundRequestLogs.correlationId, query.correlationId)
      : undefined,
  );
  const [rows, count] = await Promise.all([
    db.query.outboundRequestLogs.findMany({
      where,
      orderBy: [desc(schema.outboundRequestLogs.createdAt), desc(schema.outboundRequestLogs.id)],
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
    db.$count(schema.outboundRequestLogs, where),
  ]);
  return {
    entries: rows.map(mapSummary),
    total: count,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getRequestLogDetail(ctx: PermCtx, id: string): Promise<RequestLogDetail> {
  requireAdmin(ctx);
  const row = await db.query.outboundRequestLogs.findFirst({
    where: and(
      eq(schema.outboundRequestLogs.id, id),
      gt(schema.outboundRequestLogs.expiresAt, new Date()),
    ),
  });
  if (!row) throw new DomainError('NOT_FOUND', 'Request log not found');
  const detail: RequestLogDetail = {
    ...mapSummary(row),
    target: row.targetEncrypted ? decryptAiJson<string>(row.targetEncrypted) : null,
    requestHeaders: row.requestHeadersEncrypted
      ? decryptAiJson<RequestLogHeader[]>(row.requestHeadersEncrypted)
      : null,
    responseHeaders: row.responseHeadersEncrypted
      ? decryptAiJson<RequestLogHeader[]>(row.responseHeadersEncrypted)
      : null,
    requestBody: row.requestBodyEncrypted
      ? decryptAiJson<RequestLogBody>(row.requestBodyEncrypted)
      : null,
    responseBody: row.responseBodyEncrypted
      ? decryptAiJson<RequestLogBody>(row.responseBodyEncrypted)
      : null,
    errorDetail: row.errorDetailEncrypted
      ? decryptAiJson<Record<string, unknown>>(row.errorDetailEncrypted)
      : null,
  };
  return detail;
}

export async function cleanupExpiredRequestLogs(batchSize = 500): Promise<number> {
  const result = await db
    .delete(schema.outboundRequestLogs)
    .where(
      sql`${schema.outboundRequestLogs.id} in (select ${schema.outboundRequestLogs.id} from ${schema.outboundRequestLogs} where ${schema.outboundRequestLogs.expiresAt} <= now() limit ${batchSize})`,
    )
    .returning({ id: schema.outboundRequestLogs.id });
  return result.length;
}
