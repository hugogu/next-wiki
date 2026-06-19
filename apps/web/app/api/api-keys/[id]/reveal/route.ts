import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as apiKeyService from '@/server/services/api-keys';

/**
 * Reveal an API key secret.
 *
 * @openapi
 * @summary Reveal API key secret
 * @description Decrypts and returns the full secret for one of the user's API keys. Session-only; not callable with a Bearer key.
 * @tag User
 * @response ApiKeyReveal
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  const parsed = parseParams(uuidSchema, id);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await apiKeyService.reveal(ctx, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
