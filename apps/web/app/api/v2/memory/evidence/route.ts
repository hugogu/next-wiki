import { agentMemoryV2CaptureInputSchema } from '@next-wiki/shared';
import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../../v1/_shared/route';
import { saveEvidenceV2 } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Save a synchronous Agent Memory evidence record
 * @description Writes an immutable evidence record to the connection's private destination.
 * @tag Agent Memory
 * @body AgentMemoryV2CaptureInput
 * @response 201:AgentMemoryV2SaveResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedMemoryClient(request);
  const parsed = await parsePublicJson(request, agentMemoryV2CaptureInputSchema);
  if (!parsed.ok) return parsed.response;
  const result = await saveEvidenceV2(ctx, parsed.data);
  return publicJson(result, { status: result.idempotent ? 200 : 201 });
});
