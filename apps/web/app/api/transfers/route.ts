import { NextResponse, type NextRequest } from 'next/server';
import { transferRunCreateSchema, transferRunQuerySchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { formatZodError, parseQuery } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as transfers from '@/server/services/transfers';

/** @openapi @summary List content transfer runs @tag Transfers @auth bearer */
async function handleGET(request: NextRequest) {
  const parsed = parseQuery(transferRunQuerySchema, request.nextUrl.searchParams);
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await transfers.list(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Start a content transfer run @tag Transfers @auth bearer */
async function handlePOST(request: NextRequest) {
  const parsed = transferRunCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await transfers.create(await createApiContext(), parsed.data), {
      status: 202,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

export const GET = withApiAudit(handleGET as unknown as RouteHandler);
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
