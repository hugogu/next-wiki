import { NextResponse, type NextRequest } from 'next/server';
import { updatePagePropertiesSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { pathParamSchema, parseParams, getPathFromParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as pageService from '@/server/services/pages';

/**
 * Update page properties.
 *
 * @openapi
 * @summary Update page properties
 * @description Renames the page by updating its path.
 * @tag Pages
 * @auth bearer
 * @body UpdatePagePropertiesInput
 * @response LivePage
 */
async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const ctx = await createApiContext();
  const raw = await params;
  const parsedPath = parseParams(pathParamSchema, raw.path);
  if (!parsedPath.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedPath.error), 400);
  }

  const path = getPathFromParams(raw);

  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(updatePagePropertiesSchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    const result = await pageService.updateProperties(ctx, path, parsedBody.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
