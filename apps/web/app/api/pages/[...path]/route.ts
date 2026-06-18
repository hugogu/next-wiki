import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { pathParamSchema, parseParams, getPathFromParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';

/**
 * Delete a page.
 *
 * @openapi
 * @summary Delete a page
 * @description Deletes the page at the given path.
 * @tag Pages
 * @auth bearer
 * @response 204
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const ctx = await createApiContext();
  const raw = await params;
  const parsed = parseParams(pathParamSchema, raw.path);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  const path = getPathFromParams(raw);

  try {
    await pageService.remove(ctx, path);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Get a published page.
 *
 * @openapi
 * @summary Get a published page
 * @description Returns the live published page at the given path.
 * @tag Pages
 * @response LivePage
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const ctx = await createApiContext();
  const raw = await params;
  const parsed = parseParams(pathParamSchema, raw.path);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  const path = getPathFromParams(raw);

  try {
    const page = await pageService.getLive(ctx, path);
    if (!page) {
      return apiError('NOT_FOUND', 'Page not found', 404);
    }
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
