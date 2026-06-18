import { NextResponse } from 'next/server';
import { createApiKeyInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as apiKeyService from '@/server/services/api-keys';

/**
 * List API keys.
 *
 * @openapi
 * @summary List API keys
 * @description Returns the current user's API keys without secrets.
 * @tag User
 * @auth bearer
 * @response ApiKeyViewList
 */
export async function GET() {
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
 * @description Creates a new API key with the requested scopes. The full secret is returned only once.
 * @tag User
 * @auth bearer
 * @body CreateApiKeyInput
 * @response 201:ApiKeyCreated
 */
export async function POST(request: Request) {
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
