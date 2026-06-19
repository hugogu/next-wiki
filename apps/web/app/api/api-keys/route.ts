import { NextResponse } from 'next/server';
import { createApiKeyInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as apiKeyService from '@/server/services/api-keys';

/**
 * List API keys.
 *
 * @openapi
 * @summary List API keys
 * @description Returns the current user's API keys without secrets. Session-only; not callable with a Bearer key.
 * @tag User
 * @response ApiKeyViewList
 */
async function handleGET() {
  const ctx = await createApiContext();
  try {
    const keys = await apiKeyService.list(ctx);
    return NextResponse.json(keys);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Create an API key.
 *
 * @openapi
 * @summary Create an API key
 * @description Creates a new API key with the requested scopes. Session-only; not callable with a Bearer key. The full secret is returned only once.
 * @tag User
 * @body CreateApiKeyInput
 * @response 201:ApiKeyCreated
 */
async function handlePOST(request: Request) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(createApiKeyInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await apiKeyService.create(ctx, parsed.data.name, parsed.data.scopes);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
