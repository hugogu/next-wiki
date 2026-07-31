import { NextResponse, type NextRequest } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { uuidSchema, parseParams, formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { getPublication } from '@/server/services/static-site';

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = parseParams(uuidSchema, id);
  if (!parsedId.ok) return apiError('BAD_REQUEST', formatZodError(parsedId.error), 400);

  try {
    const run = await getPublication(await createApiContext(), parsedId.data);
    if (!run) return apiError('NOT_FOUND', 'Publish run not found', 404);
    return NextResponse.json(run);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get a static site publish run
 * @description Returns one publish run for status polling. Error messages are stored redacted of credential material and are safe to display.
 * @tag StaticSite
 * @auth bearer
 * @response StaticSitePublicationView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);
