import { agentMemoryV2SaveInputSchema } from '@next-wiki/shared';
import { assertSupportedMemoryClient, publicJson, withPublicApi } from '../_shared';
import { parsePublicJson } from '../../../v1/_shared/route';
import { saveV2 } from '@/server/services/agent-memory';

/**
 * @openapi
 * @summary Save an Agent Memory v2 record
 * @description Writes to the connection's server-selected private destination. Shared destinations require an owner-managed grant and cannot be selected by the client.
 * @tag Agent Memory
 * @body AgentMemoryV2SaveInput
 * @response 201:AgentMemoryV2SaveResponse
 */
export const POST = withPublicApi(async (request, _context, ctx) => {
  assertSupportedMemoryClient(request);
  const parsed = await parsePublicJson(request, agentMemoryV2SaveInputSchema);
  if (!parsed.ok) return parsed.response;
  const result = await saveV2(ctx, parsed.data);
  return publicJson(result, { status: result.idempotent ? 200 : 201 });
});
