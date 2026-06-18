import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { pathParamSchema, parseParams, getPathFromParams, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import * as pageService from '@/server/services/pages';

/**
 * Get page history.
 *
 * @openapi
 * @summary Get page history
 * @description Returns the revision history for the page at the given path.
 * @tag History
 * @response RevisionSummaryList
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
    const history = await pageService.getHistory(ctx, path);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}
