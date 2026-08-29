import { NextResponse } from 'next/server';
import { agentMemoryPromotionInputSchema } from '@next-wiki/shared';
import { createApiContext } from '@/server/api/session';
import { parseJson, formatZodError } from '@/server/api/validate';
import { apiError, handleApiError } from '@/server/api/errors';
import { withApiAudit, type RouteHandler } from '@/server/api/audit-wrapper';
import * as agentMemoryManagement from '@/server/services/agent-memory-management';

async function handlePOST(request: Request) {
  const ctx = await createApiContext();
  const body = await request.json().catch(() => ({}));
  const parsed = parseJson(agentMemoryPromotionInputSchema, body);
  if (!parsed.ok) {
    return apiError('BAD_REQUEST', formatZodError(parsed.error), 400);
  }

  try {
    const result = await agentMemoryManagement.promote(ctx, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Promote a private Agent memory record into a shared destination.
 *
 * @openapi
 * @summary Promote an Agent memory record to a shared destination
 * @description Owner-only curation: copies an existing record into a new, separately attributable shared record. The source record and its original destination's access are unchanged. Session-only; not callable with a Bearer key — an agent capture never publishes or shares a record automatically.
 * @tag User
 * @body AgentMemoryPromotionInput
 * @response 201:AgentMemoryPromotionResult
 */
export const POST = withApiAudit(handlePOST as unknown as RouteHandler);
