import { NextResponse, type NextRequest } from 'next/server';
import { integrationKindSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { deleteIntegration, getIntegration } from '@/server/services/integrations';

function parseKind(kind: string) {
  const parsed = integrationKindSchema.safeParse(kind);
  return parsed.success ? parsed.data : null;
}

async function handleGET(_request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const kind = parseKind((await params).kind);
  if (!kind) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    return NextResponse.json(await getIntegration(await createApiContext(), kind));
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Get an integration
 * @description Returns one external-service credential with the secret masked, or null when unconfigured. Admin only.
 * @tag Integrations
 * @auth bearer
 * @response IntegrationView
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);

async function handleDELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const kind = parseKind((await params).kind);
  if (!kind) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    await deleteIntegration(await createApiContext(), kind);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Remove an integration
 * @description Deletes the stored credential. Refused while a feature still depends on it.
 * @tag Integrations
 * @auth bearer
 */
export const DELETE = withApiAudit(handleDELETE as unknown as RouteHandler);
