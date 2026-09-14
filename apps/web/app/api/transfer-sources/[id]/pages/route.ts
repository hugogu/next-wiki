import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as sources from '@/server/services/transfer-sources';

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json({ items: await sources.listSourcePages(await createApiContext(), id) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary List the pages a Wiki.js source currently publishes
 * @tag Transfers
 * @auth bearer
 * @pathParams TransferSourceIdPathParams
 * @response WikiJsSourcePageList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
