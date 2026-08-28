import { NextResponse, type NextRequest } from 'next/server';
import { transferItemQuerySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { formatZodError, parseQuery, uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as transfers from '@/server/services/transfers';

async function handleGET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  const parsed = parseQuery(transferItemQuerySchema, request.nextUrl.searchParams);
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await transfers.listItems(await createApiContext(), id, parsed.data));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary List content transfer item outcomes
 * @tag Transfers
 * @auth bearer
 * @response TransferItemList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
