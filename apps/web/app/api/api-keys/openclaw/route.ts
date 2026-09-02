import { NextResponse } from 'next/server';
import { createApiContext } from '@/server/api/session';
import { createOpenClawKey } from '@/server/services/api-keys';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import { openClawKeyInputSchema } from '@next-wiki/shared';

async function handlePOST(request: Request) {
  const ctx = await createApiContext();
  const parsed = parseJson(openClawKeyInputSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  try {
    const response = NextResponse.json(await createOpenClawKey(ctx, {
      ...parsed.data,
      agentIdentity: parsed.data.agentIdentity ?? 'openclaw',
      scopes: parsed.data.scopes ?? ['view', 'memory.read', 'memory.write'],
      spaceAccess: parsed.data.spaceAccess ?? ['wiki'],
    }), { status: 201 });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * @openapi
 * @summary Provision an OpenClaw API key
 * @description Creates one account-bound OpenClaw key with the requested Agent Memory scopes and content-space grants. The full secret is returned only in this response.
 * @tag User
 * @body OpenClawKeyInput
 * @response 201:OpenClawKeyCreated
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
