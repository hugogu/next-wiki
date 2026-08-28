import { agentMemoryEvidenceInputSchema } from '@next-wiki/shared';
import { assertSupportedProvider, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../_shared/route';
import { submitEvidenceCapture } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Queue agent evidence capture
 * @description Queues an idempotent evidence capture. Clients must poll the returned capture URL before claiming a strict checkpoint is durable.
 * @tag Agent Memory
 * @body AgentMemoryEvidenceInput
 * @response 202:AgentMemoryEvidenceQueued
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedProvider(request);
  const parsed = await parsePublicJson(request, agentMemoryEvidenceInputSchema);
  if (!parsed.ok) return parsed.response;
  const result = await submitEvidenceCapture(ctx, parsed.data);
  return publicJson({
    captureId: result.captureId,
    status: result.status,
    // Return a complete origin-relative API path. Clients must resolve this
    // against the configured API origin, rather than append it to the
    // already-versioned `/api/v1` base URL.
    pollUrl: `/api/v1/memory/evidence/${result.captureId}`,
    idempotent: result.idempotent,
  }, { status: result.idempotent ? 200 : 202 });
});
