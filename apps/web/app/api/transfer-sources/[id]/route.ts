import { NextResponse, type NextRequest } from 'next/server';
import { transferSourceUpdateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { formatZodError, uuidSchema } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as sources from '@/server/services/transfer-sources';

async function sourceId(params: Promise<{ id: string }>) {
  const { id } = await params;
  return uuidSchema.safeParse(id).success ? id : null;
}

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = await sourceId(params);
  if (!id) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    const view = await sources.get(await createApiContext(), id);
    return view ? NextResponse.json(view) : apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handlePATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = await sourceId(params);
  if (!id) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  const parsed = transferSourceUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await sources.update(await createApiContext(), id, parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handleDELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = await sourceId(params);
  if (!id) return apiError('TRANSFER_NOT_FOUND', 'Not found', 404);
  try {
    await sources.remove(await createApiContext(), id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/** @openapi @summary Get a Wiki.js transfer source @tag Transfers @auth bearer */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/** @openapi @summary Update a Wiki.js transfer source @tag Transfers @auth bearer */
export const PATCH = withApiAudit(handlePATCH as unknown as RouteHandler);
/** @openapi @summary Delete a Wiki.js transfer source @tag Transfers @auth bearer */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
