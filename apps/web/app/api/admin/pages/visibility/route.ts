import { NextResponse, type NextRequest } from 'next/server';
import { bulkPageVisibilityInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { setPagesVisibility } from '@/server/services/page-visibility';

async function handlePOST(request: NextRequest) {
  const ctx = await createApiContext();
  if (ctx.actor.kind !== 'user' || ctx.actor.role !== 'admin') {
    return apiError('FORBIDDEN', 'Only Administrators can change page visibility', 403);
  }

  const parsedBody = parseJson(bulkPageVisibilityInputSchema, await request.json().catch(() => ({})));
  if (!parsedBody.ok) return apiError('BAD_REQUEST', formatZodError(parsedBody.error), 400);

  try {
    return NextResponse.json(await setPagesVisibility(ctx, parsedBody.data));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Bulk visibility for the Admin page list: chosen pages, or a folder of one
 * space. Not exposed to API keys or MCP; visibility stays an administrator
 * decision made in the web UI.
 *
 * @openapi
 * @summary Set the visibility of many pages
 * @description Gives chosen pages, or every source page in a folder of one space (the whole space when pathPrefix is omitted), the same visibility. Each changed page is audited individually. At most 500 pages change per request, in path order; repeat the request while remaining is above 0. With dryRun, nothing changes and the counts describe what would. Administrator session only; not callable with a Bearer key.
 * @tag Admin
 * @body BulkPageVisibilityInput
 * @response BulkPageVisibilityResult
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
