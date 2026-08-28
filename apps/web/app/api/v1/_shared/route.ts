import { NextResponse, type NextRequest } from 'next/server';
import { type ZodSchema, type ZodTypeDef } from 'zod';
import { createApiContext } from '@/server/api/session';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { DomainError } from '@/server/errors';
import { internalError } from '@/server/api/errors';
import { mapPublicDomainError, publicApiError, validationError } from '@/server/api/public-errors';
import { logger } from '@/server/logger';
import type { PermCtx } from '@/server/permissions';

export type PublicRouteContext<TParams extends Record<string, string | string[]> = Record<string, string | string[]>> = {
  params: Promise<TParams>;
};

export type PublicRouteHandler<TParams extends Record<string, string | string[]> = Record<string, string | string[]>> = (
  request: NextRequest,
  context: PublicRouteContext<TParams>,
  ctx: PermCtx,
) => Promise<Response> | Response;

export function publicJson<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(data, { ...init, headers });
}

export async function parsePublicJson<TOutput, TInput = TOutput>(
  request: NextRequest,
  schema: ZodSchema<TOutput, ZodTypeDef, TInput>,
): Promise<{ ok: true; data: TOutput } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    logger.warnException('invalid JSON request body', error);
    return { ok: false, response: publicApiError('VALIDATION_FAILED', 'Invalid JSON request body', 422) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, response: validationError(parsed.error) };
  return { ok: true, data: parsed.data };
}

export async function parseOptionalPublicJson<TOutput, TInput = TOutput>(
  request: NextRequest,
  schema: ZodSchema<TOutput, ZodTypeDef, TInput>,
): Promise<{ ok: true; data: TOutput } | { ok: false; response: Response }> {
  const raw = await request.text();
  if (!raw.trim()) {
    const parsed = schema.safeParse({});
    if (!parsed.success) return { ok: false, response: validationError(parsed.error) };
    return { ok: true, data: parsed.data };
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch (error) {
    logger.warnException('invalid JSON request body', error);
    return { ok: false, response: publicApiError('VALIDATION_FAILED', 'Invalid JSON request body', 422) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, response: validationError(parsed.error) };
  return { ok: true, data: parsed.data };
}

export function parsePublicQuery<TOutput, TInput = TOutput>(
  request: NextRequest,
  schema: ZodSchema<TOutput, ZodTypeDef, TInput>,
): { ok: true; data: TOutput } | { ok: false; response: Response } {
  const searchParams = new URL(request.url).searchParams;
  const raw: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    // Repeated query keys (e.g. filter[tag]=a&filter[tag]=b) become an array;
    // a single occurrence stays a plain string for backward compatibility.
    raw[key] = values.length > 1 ? values : values[0];
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: validationError(parsed.error) };
  return { ok: true, data: parsed.data };
}

export function withPublicApi<TParams extends Record<string, string | string[]> = Record<string, string | string[]>>(
  handler: PublicRouteHandler<TParams>,
): RouteHandler {
  return withApiAudit(async (request, context) => {
    const ctx = await createApiContext();
    const method = request.method;
    const path = new URL(request.url).pathname;
    try {
      return await handler(request, context as PublicRouteContext<TParams>, ctx);
    } catch (error) {
      if (error instanceof DomainError) {
        logger.warn('Public API domain error', { code: error.code, message: error.message, method, path });
        return mapPublicDomainError(error);
      }
      logger.exception('Unhandled public API error', error, { method, path });
      return internalError();
    }
  });
}
