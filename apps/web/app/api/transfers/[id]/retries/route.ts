import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as transfers from '@/server/services/transfers';

async function handlePOST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await transfers.retry(await createApiContext(), id), { status: 202 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Retry an incomplete transfer run
 * @tag Transfers
 * @auth bearer
 * @response 202:TransferRunAccepted
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
