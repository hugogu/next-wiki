import { NextResponse, type NextRequest } from 'next/server';
import { type ZodSchema, type ZodTypeDef } from 'zod';
import { createApiContext } from '@/server/api/session';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { DomainError } from '@/server/errors';
import { internalError } from '@/server/api/errors';
import { mapPublicDomainError, publicApiError, validationError } from '@/server/api/public-errors';
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
  return NextResponse.json(data, init);
}

export async function parsePublicJson<T>(request: NextRequest, schema: ZodSchema<T>): Promise<
  { ok: true; data: T } | { ok: false; response: Response }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
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
  const raw: Record<string, unknown> = {};
  new URL(request.url).searchParams.forEach((value, key) => {
    raw[key] = value;
  });

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: validationError(parsed.error) };
  return { ok: true, data: parsed.data };
}

export function withPublicApi<TParams extends Record<string, string | string[]> = Record<string, string | string[]>>(
  handler: PublicRouteHandler<TParams>,
): RouteHandler {
  return withApiAudit(async (request, context) => {
    const ctx = await createApiContext();
    try {
      return await handler(request, context as PublicRouteContext<TParams>, ctx);
    } catch (error) {
      if (error instanceof DomainError) return mapPublicDomainError(error);
      console.error('Unhandled public API error:', error);
      return internalError();
    }
  });
}
