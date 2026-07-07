import { NextResponse, type NextRequest } from 'next/server';
import { transferSourceCreateSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { formatZodError } from '@/server/api/validate';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as sources from '@/server/services/transfer-sources';

async function handleGET() {
  try {
    return NextResponse.json({ items: await sources.list(await createApiContext()) });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handlePOST(request: NextRequest) {
  const parsed = transferSourceCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await sources.create(await createApiContext(), parsed.data), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

async function handleTest(request: NextRequest) {
  const parsed = transferSourceCreateSchema
    .omit({ name: true, enabled: true, type: true })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    return NextResponse.json(await sources.test(await createApiContext(), parsed.data));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary List Wiki.js transfer sources
 * @tag Transfers
 * @auth bearer
 * @response TransferSourceList
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
/**
 * @openapi
 * @summary Create a Wiki.js transfer source
 * @tag Transfers
 * @auth bearer
 * @response 201:TransferSourceView
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
/**
 * @openapi
 * @summary Test Wiki.js source credentials without creating a source
 * @tag Transfers
 * @auth bearer
 * @response SourceTestResult
 */
export const PATCH = withApiAudit(handleTest as unknown as RouteHandler);
