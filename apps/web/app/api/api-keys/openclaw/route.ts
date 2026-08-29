import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { createOpenClawPair } from '@/server/services/api-keys';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { openClawPairedKeyInputSchema } from '@next-wiki/shared';

async function handlePOST(request: Request) {
  const ctx = await createApiContext();
  const parsed = parseJson(openClawPairedKeyInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const response = NextResponse.json(await createOpenClawPair(ctx, {
      displayName: parsed.data.displayName,
      agentIdentity: parsed.data.agentIdentity ?? 'openclaw',
      includeRaw: parsed.data.includeRaw ?? false,
      includeGenerated: parsed.data.includeGenerated ?? false,
    }), { status: 201 });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Provision paired OpenClaw API keys
 * @description Creates one mirror key and one read-only knowledge-search key. Full secrets are returned only in this response.
 * @tag User
 * @body OpenClawPairedKeyInput
 * @response 201:OpenClawPairedKeyCreated
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
