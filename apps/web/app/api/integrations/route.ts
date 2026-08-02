import { NextResponse, type NextRequest } from 'next/server';
import { integrationUpsertSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, internalError, mapDomainError } from '@/server/api/errors';
import { DomainError } from '@/server/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { configureIntegration, listIntegrations } from '@/server/services/integrations';

async function handleGET() {
  try {
    const items = await listIntegrations(await createApiContext());
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary List integrations
 * @description Returns the configured external-service credentials with secrets masked. Admin only.
 * @tag Integrations
 * @auth bearer
 * @response IntegrationListResponse
 */
export const GET = withApiAudit(handleGET as unknown as RouteHandler);

async function handlePUT(request: NextRequest) {
  const parsed = parseJson(
    integrationUpsertSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const result = await configureIntegration(await createApiContext(), parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DomainError) return mapDomainError(error);
    return internalError();
  }
}

/**
 * @openapi
 * @summary Configure an integration
 * @description Creates or updates the credential for an external service. The secret is write-only and never returned; omitting it keeps the stored credential.
 * @tag Integrations
 * @auth bearer
 * @body IntegrationUpsert
 * @response IntegrationView
 */
export const PUT = withApiAudit(handlePUT as unknown as RouteHandler);
