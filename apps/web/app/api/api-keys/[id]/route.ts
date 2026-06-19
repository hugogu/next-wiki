import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as apiKeyService from '@/server/services/api-keys';

/**
 * Revoke an API key.
 *
 * @openapi
 * @summary Revoke API key
 * @description Revokes one of the user's API keys. Session-only; not callable with a Bearer key.
 * @tag User
 * @response 204
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  const parsed = parseParams(uuidSchema, id);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    await apiKeyService.revoke(ctx, parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
