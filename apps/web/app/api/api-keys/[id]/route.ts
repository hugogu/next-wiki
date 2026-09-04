import { NextResponse } from 'next/server';
import { updateApiKeyInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as apiKeyService from '@/server/services/api-keys';

async function handlePATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await createApiContext();
  const { id } = await params;
  const parsedParams = parseParams(uuidSchema, id);
  if (!parsedParams.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedParams.error), 400);
  }
  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(updateApiKeyInputSchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    const result = await apiKeyService.update(ctx, parsedParams.data, parsedBody.data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

async function handleDELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return handleApiError(error);
  }
}

/**
 * Revoke an API key.
 *
 * @openapi
 * @summary Revoke API key
 * @description Revokes one of the user's API keys. Session-only; not callable with a Bearer key.
 * @tag User
 * @pathParams ApiKeyIdPathParams
 * @response 204
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);

/**
 * Update an API key's permission grants.
 *
 * @openapi
 * @summary Update API key permissions
 * @description Updates the active user's API key scopes and/or content-space access without changing the key secret. Session-only; not callable with a Bearer key.
 * @tag User
 * @pathParams ApiKeyIdPathParams
 * @body UpdateApiKeyInput
 * @response ApiKeyView
 */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
