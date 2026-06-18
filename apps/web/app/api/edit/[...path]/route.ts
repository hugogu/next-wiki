import { NextResponse, type NextRequest } from 'next/server';
import { newDraftBodySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { pathParamSchema, parseParams, getPathFromParams, parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as pageService from '@/server/services/pages';

/**
 * Get the editable view of a page.
 *
 * @openapi
 * @summary Get editable page
 * @description Returns the editable view of the page at the given path, including its latest draft.
 * @tag Edit
 * @auth bearer
 * @response EditableView
 */
async function handleGET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const ctx = await createApiContext();
  const raw = await params;
  const parsed = parseParams(pathParamSchema, raw.path);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  const path = getPathFromParams(raw);

  try {
    const view = await pageService.getForEdit(ctx, path);
    if (!view) {
      return apiError('NOT_FOUND', 'Page not found', 404);
    }
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Create a new draft for a page.
 *
 * @openapi
 * @summary Create a new draft
 * @description Creates a new draft revision for the page at the given path.
 * @tag Edit
 * @auth bearer
 * @body NewDraftBody
 * @response 201:RevisionView
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const ctx = await createApiContext();
  const raw = await params;
  const parsedPath = parseParams(pathParamSchema, raw.path);
  if (!parsedPath.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedPath.error), 400);
  }

  const path = getPathFromParams(raw);

  const body = await request.json().catch(() => ({}));
  const parsedBody = parseJson(newDraftBodySchema, body);
  if (!parsedBody.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);
  }

  try {
    const result = await pageService.newDraft(ctx, path, parsedBody.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
