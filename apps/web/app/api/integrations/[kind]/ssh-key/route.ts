import { NextResponse, type NextRequest } from 'next/server';
import { integrationKindSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { generateSshKey } from '@/server/services/integrations';

async function handlePOST(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const parsed = integrationKindSchema.safeParse((await params).kind);
  if (!parsed.success) return apiError('NOT_FOUND', 'Not found', 404);
  try {
    const result = await generateSshKey(await createApiContext(), parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Generate an SSH deploy key for an integration
 * @description Generates an ed25519 keypair and stores the private half encrypted. The public half is returned so it can be installed as a deploy key; one key covers every feature that uses the service.
 * @tag Integrations
 * @auth bearer
 * @response IntegrationSshKeyResult
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
