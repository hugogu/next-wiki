import { NextResponse, type NextRequest } from 'next/server';
import { createPageInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, mapDomainError, internalError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as pageService from '@/server/services/pages';

/**
 * List all published pages.
 *
 * @openapi
 * @summary List published pages
 * @description Returns a list of published page summaries.
 * @tag Pages
 * @response PageSummaryList
 */
async function handleGET() {
  const ctx = await createApiContext();
  try {
    const pages = await pageService.listPublished(ctx);
    return NextResponse.json(pages);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * Create a new page.
 *
 * @openapi
 * @summary Create a page
 * @description Creates a new published page from the provided title, path, and markdown source.
 * @tag Pages
 * @auth bearer
 * @body CreatePageInput
 * @response 201:LivePage
 */
async function handlePOST(request: NextRequest) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(createPageInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await pageService.create(ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
