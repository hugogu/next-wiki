import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as artifacts from '@/server/services/transfer-artifacts';

/** @openapi @summary Get transfer artifact metadata @tag Transfers @auth bearer */
async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await artifacts.get(await createApiContext(), id));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Delete a transfer artifact @tag Transfers @auth bearer */
async function handleDELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    await artifacts.remove(await createApiContext(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
